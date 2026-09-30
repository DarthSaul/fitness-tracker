import { describe, test, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

import handler from './[id].patch'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockFindUnique = prisma.post.findUnique as ReturnType<typeof vi.fn>
const mockUpdate = prisma.post.update as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }

const createdAt = new Date('2026-09-30T12:00:00.000Z')
const editedAt = new Date('2026-09-30T13:00:00.000Z')
const me = { id: 'ca', name: 'Ada', avatarUrl: null }
const mine = { id: 'p1', authorId: 'ca', body: 'Leg day', visibility: 'FRIENDS', createdAt, editedAt: null, author: me }

function call(body: unknown, userId = 'ca') {
  mockGetRouterParam.mockReturnValue('p1')
  mockReadBody.mockResolvedValueOnce(body)
  return (handler as unknown as (e: Event) => Promise<{ body: string; visibility: string; editedAt: Date | null }>)({
    path: '/api/posts/p1', context: { userId },
  })
}

describe('PATCH /api/posts/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUnique.mockResolvedValue(mine)
  })

  test('edits the body and visibility, stamping editedAt', async () => {
    mockUpdate.mockResolvedValueOnce({ ...mine, body: 'Arm day', visibility: 'PUBLIC', editedAt })

    const result = await call({ body: '  Arm day ', visibility: 'PUBLIC' })

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { body: 'Arm day', visibility: 'PUBLIC', editedAt: expect.any(Date) },
      select: expect.objectContaining({ id: true }),
    })
    expect(result).toMatchObject({ body: 'Arm day', visibility: 'PUBLIC', editedAt })
  })

  test('only the fields sent are changed', async () => {
    mockUpdate.mockResolvedValueOnce({ ...mine, visibility: 'PUBLIC', editedAt })

    await call({ visibility: 'PUBLIC' })

    expect(mockUpdate.mock.calls[0]![0].data).toEqual({ visibility: 'PUBLIC', editedAt: expect.any(Date) })
  })

  // Pins the contract (PR #134 review): omitted visibility means "keep it" on
  // PATCH — unlike POST, where it defaults to FRIENDS — so a body-only edit can
  // never silently narrow a PUBLIC post.
  test('a body-only edit keeps the current visibility, even when it is PUBLIC', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...mine, visibility: 'PUBLIC' })
    mockUpdate.mockResolvedValueOnce({ ...mine, visibility: 'PUBLIC', body: 'Arm day', editedAt })

    const result = await call({ body: 'Arm day' })

    expect(mockUpdate.mock.calls[0]![0].data).toEqual({ body: 'Arm day', editedAt: expect.any(Date) })
    expect(result.visibility).toBe('PUBLIC')
  })

  test('a no-op PATCH (same values) writes nothing and leaves editedAt null', async () => {
    const result = await call({ body: 'Leg day', visibility: 'FRIENDS' })

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(result.editedAt).toBeNull()
  })

  test.each([
    ['another user (even a friend)', 'cz', mine],
    ['a post that does not exist', 'ca', null],
  ])('404 for %s', async (_label, userId, row) => {
    mockFindUnique.mockResolvedValueOnce(row)
    await expect(call({ body: 'Hacked' }, userId)).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Post not found' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test('404 when the post is deleted between read and write (P2025)', async () => {
    mockUpdate.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: 'test' }))
    await expect(call({ body: 'Arm day' })).rejects.toMatchObject({ statusCode: 404 })
  })

  test.each([
    ['an empty object', {}],
    ['no body at all', undefined],
    ['an empty body', { body: '  ' }],
    ['a body over 2000 characters', { body: 'x'.repeat(2001) }],
    ['an invalid visibility', { visibility: 'friends' }],
  ])('400 on %s', async (_label, body) => {
    await expect(call(body)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test('500 with a generic message on a database error', async () => {
    mockFindUnique.mockRejectedValueOnce(new Error('timeout'))
    await expect(call({ body: 'Arm day' })).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to update post' })
    expect(logger.error).toHaveBeenCalled()
  })
})
