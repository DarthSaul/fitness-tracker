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
const me = { id: 'ca', name: 'Ada', avatarUrl: null, profileVisibility: 'PUBLIC' }
const mine = { id: 'p1', authorId: 'ca', body: 'Leg day', createdAt, editedAt: null, author: me, photos: [] as { id: string; storagePath: string; width: number; height: number }[], sharedWorkoutKind: null as string | null, sharedProgramName: null }

function call(body: unknown, userId = 'ca') {
  mockGetRouterParam.mockReturnValue('p1')
  mockReadBody.mockResolvedValueOnce(body)
  return (handler as unknown as (e: Event) => Promise<{ body: string; editedAt: Date | null }>)({
    path: '/api/posts/p1', context: { userId },
  })
}

describe('PATCH /api/posts/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUnique.mockResolvedValue(mine)
  })

  test('edits the body, stamping editedAt', async () => {
    mockUpdate.mockResolvedValueOnce({ ...mine, body: 'Arm day', editedAt })

    const result = await call({ body: '  Arm day ' })

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { body: 'Arm day', editedAt: expect.any(Date) },
      select: expect.objectContaining({ id: true }),
    })
    expect(result).toMatchObject({ body: 'Arm day', editedAt })
  })

  test("a photo post's text may be cleared; a text-only post's may not", async () => {
    const withPhoto = { ...mine, photos: [{ id: 'ph1', storagePath: 'ca/ph1.jpg', width: 1, height: 1 }] }
    mockFindUnique.mockResolvedValueOnce(withPhoto)
    mockUpdate.mockResolvedValueOnce({ ...withPhoto, body: '', editedAt })

    await call({ body: '   ' })

    expect(mockUpdate.mock.calls[0]![0].data).toEqual({ body: '', editedAt: expect.any(Date) })

    mockFindUnique.mockResolvedValueOnce(mine)
    await expect(call({ body: '' })).rejects.toMatchObject({ statusCode: 400 })
  })

  test("a workout share's text may be cleared too", async () => {
    const share = { ...mine, sharedWorkoutKind: 'STANDALONE', sharedProgramName: null }
    mockFindUnique.mockResolvedValueOnce(share)
    mockUpdate.mockResolvedValueOnce({ ...share, body: '', editedAt })

    await call({ body: '' })

    expect(mockUpdate.mock.calls[0]![0].data).toEqual({ body: '', editedAt: expect.any(Date) })
  })

  test('the share is fixed once posted: session id keys are ignored', async () => {
    mockUpdate.mockResolvedValueOnce({ ...mine, body: 'Arm day', editedAt })

    await call({ body: 'Arm day', workoutSessionId: 's1', standaloneSessionId: 'x1' })

    expect(mockUpdate.mock.calls[0]![0].data).toEqual({ body: 'Arm day', editedAt: expect.any(Date) })
  })

  test('photos are fixed once posted: a photoIds key is ignored', async () => {
    mockUpdate.mockResolvedValueOnce({ ...mine, body: 'Arm day', editedAt })

    await call({ body: 'Arm day', photoIds: ['other'] })

    expect(mockUpdate.mock.calls[0]![0].data).toEqual({ body: 'Arm day', editedAt: expect.any(Date) })
  })

  test('a legacy visibility key is ignored — privacy is per profile now', async () => {
    mockUpdate.mockResolvedValueOnce({ ...mine, body: 'Arm day', editedAt })

    await call({ body: 'Arm day', visibility: 'FRIENDS' })

    expect(mockUpdate.mock.calls[0]![0].data).toEqual({ body: 'Arm day', editedAt: expect.any(Date) })
  })

  test('a no-op PATCH (same body) writes nothing and leaves editedAt null', async () => {
    const result = await call({ body: 'Leg day' })

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(result.editedAt).toBeNull()
  })

  test.each([
    ['another user (even a follower)', 'cz', mine],
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
    ['only a legacy visibility key', { visibility: 'PUBLIC' }],
    ['an empty body on a text-only post', { body: '  ' }],
    ['a body over 2000 characters', { body: 'x'.repeat(2001) }],
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
