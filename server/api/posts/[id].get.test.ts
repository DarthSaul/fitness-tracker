import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[id].get'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockFindUnique = prisma.post.findUnique as ReturnType<typeof vi.fn>
const mockCanView = canViewPost as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }

const createdAt = new Date('2026-09-30T12:00:00.000Z')
const row = { id: 'p1', authorId: 'cz', body: 'Leg day', visibility: 'FRIENDS', createdAt, editedAt: null, author: { id: 'cz', name: 'Zed', avatarUrl: null } }

function call(id: string | undefined = 'p1') {
  mockGetRouterParam.mockReturnValue(id)
  return (handler as unknown as (e: Event) => Promise<unknown>)({ path: `/api/posts/${id}`, context: { userId: 'ca' } })
}

describe('GET /api/posts/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUnique.mockResolvedValue(row)
    mockCanView.mockResolvedValue(true)
  })

  test('returns the post when the visibility rule allows it', async () => {
    const result = await call()

    expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: 'p1' }, select: expect.objectContaining({ authorId: true, visibility: true }) })
    expect(mockCanView).toHaveBeenCalledWith('ca', row)
    expect(result).toEqual({
      id: 'p1', author: row.author, body: 'Leg day', visibility: 'FRIENDS', createdAt, editedAt: null, isMine: false,
    })
  })

  test('404 — identical to not-found — when the rule denies it', async () => {
    mockCanView.mockResolvedValueOnce(false)
    await expect(call()).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Post not found' })
  })

  test('404 when the post does not exist', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    await expect(call()).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Post not found' })
    expect(mockCanView).not.toHaveBeenCalled()
  })

  test('400 when the id param is missing', async () => {
    await expect(call('')).rejects.toMatchObject({ statusCode: 400 })
  })

  test('500 with a generic message on a database error', async () => {
    mockFindUnique.mockRejectedValueOnce(new Error('timeout'))
    await expect(call()).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch post' })
    expect(logger.error).toHaveBeenCalled()
  })
})
