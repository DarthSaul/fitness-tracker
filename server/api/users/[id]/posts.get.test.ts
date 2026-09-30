import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './posts.get'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockGetQuery = getQuery as ReturnType<typeof vi.fn>
const mockFindUser = prisma.user.findUnique as ReturnType<typeof vi.fn>
const mockFindPosts = prisma.post.findMany as ReturnType<typeof vi.fn>
const mockIsBlocked = isBlockedEitherWay as ReturnType<typeof vi.fn>
const mockAreFriends = areFriends as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }
type Result = { posts: { id: string; isMine: boolean }[] }

const ME = 'ca'
const THEM = 'cz'
const createdAt = new Date('2026-09-30T12:00:00.000Z')
const zed = { id: THEM, name: 'Zed', avatarUrl: null }
const newestFirst = [{ createdAt: 'desc' }, { id: 'desc' }]

function call(userId = THEM, query: Record<string, unknown> = {}) {
  mockGetRouterParam.mockReturnValue(userId)
  mockGetQuery.mockReturnValue(query)
  return (handler as unknown as (e: Event) => Promise<Result>)({ path: `/api/users/${userId}/posts`, context: { userId: ME } })
}

describe('GET /api/users/:id/posts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUser.mockResolvedValue({ id: THEM })
    mockIsBlocked.mockResolvedValue(false)
    mockAreFriends.mockResolvedValue(false)
    mockFindPosts.mockResolvedValue([])
  })

  test('a stranger sees only PUBLIC posts, newest first, default page of 20', async () => {
    mockFindPosts.mockResolvedValueOnce([
      { id: 'p1', authorId: THEM, body: 'Hi', visibility: 'PUBLIC', createdAt, editedAt: null, author: zed },
    ])

    const result = await call()

    expect(mockFindPosts).toHaveBeenCalledWith({
      where: { authorId: THEM, visibility: 'PUBLIC' },
      orderBy: newestFirst,
      take: 20,
      select: expect.objectContaining({ id: true }),
    })
    expect(result.posts).toEqual([
      { id: 'p1', author: zed, body: 'Hi', visibility: 'PUBLIC', createdAt, editedAt: null, isMine: false },
    ])
  })

  test('a friend sees PUBLIC and FRIENDS posts', async () => {
    mockAreFriends.mockResolvedValueOnce(true)

    await call()

    expect(mockAreFriends).toHaveBeenCalledWith(ME, THEM)
    expect(mockFindPosts.mock.calls[0]![0].where).toEqual({ authorId: THEM })
  })

  test('the caller sees all of their own posts, without block or friend lookups', async () => {
    mockFindUser.mockResolvedValueOnce({ id: ME })

    await call(ME)

    expect(mockFindPosts.mock.calls[0]![0].where).toEqual({ authorId: ME })
    expect(mockIsBlocked).not.toHaveBeenCalled()
    expect(mockAreFriends).not.toHaveBeenCalled()
  })

  test('pages past the cursor with the id tiebreak and the requested limit', async () => {
    await call(THEM, { limit: '5', before: '2026-09-30T12:00:00.000Z', beforeId: 'p9' })

    expect(mockFindPosts).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        authorId: THEM,
        visibility: 'PUBLIC',
        OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: 'p9' } }],
      },
      take: 5,
    }))
  })

  test('404 when the user does not exist', async () => {
    mockFindUser.mockResolvedValueOnce(null)
    await expect(call()).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User not found' })
    expect(mockFindPosts).not.toHaveBeenCalled()
  })

  test('404 — identical to not-found — when a block exists either way', async () => {
    mockIsBlocked.mockResolvedValueOnce(true)

    await expect(call()).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User not found' })
    expect(mockIsBlocked).toHaveBeenCalledWith(ME, THEM)
    expect(mockFindPosts).not.toHaveBeenCalled()
  })

  test.each([
    [{ limit: 'ten' }],
    [{ before: '2026-09-30T12:00:00.000Z' }],
    [{ before: 'soon', beforeId: 'p1' }],
  ])('400 on bad pagination %o, before any query', async (query) => {
    await expect(call(THEM, query)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockFindUser).not.toHaveBeenCalled()
  })

  test('400 when the id param is missing', async () => {
    await expect(call('')).rejects.toMatchObject({ statusCode: 400 })
  })

  test('500 with a generic message on a database error', async () => {
    mockFindPosts.mockRejectedValueOnce(new Error('timeout'))
    await expect(call()).rejects.toMatchObject({ statusCode: 500, statusMessage: "Failed to fetch user's posts" })
    expect(logger.error).toHaveBeenCalled()
  })
})
