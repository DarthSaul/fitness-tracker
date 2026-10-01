import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './feed.get'

const mockGetQuery = getQuery as ReturnType<typeof vi.fn>
const mockFollowingIdsOf = followingIdsOf as ReturnType<typeof vi.fn>
const mockFindPosts = prisma.post.findMany as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }
type Result = { posts: { id: string; isMine: boolean }[] }

const ME = 'me'
const t1 = new Date('2026-09-30T12:00:00.000Z')
const t2 = new Date('2026-09-30T11:00:00.000Z')
const meUser = { id: ME, name: 'Me', avatarUrl: null, profileVisibility: 'PRIVATE' }
const ann = { id: 'ann', name: 'Ann', avatarUrl: null, profileVisibility: 'PRIVATE' }
const newestFirst = [{ createdAt: 'desc' }, { id: 'desc' }]

function call(query: Record<string, unknown> = {}) {
  mockGetQuery.mockReturnValue(query)
  return (handler as unknown as (e: Event) => Promise<Result>)({ path: '/api/feed', context: { userId: ME } })
}

describe('GET /api/feed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFollowingIdsOf.mockResolvedValue([])
    mockFindPosts.mockResolvedValue([])
  })

  test('my posts plus everyone I follow (accepted), newest first, default page of 20', async () => {
    mockFollowingIdsOf.mockResolvedValueOnce(['ann', 'bo'])
    mockFindPosts.mockResolvedValueOnce([
      { id: 'p2', authorId: 'ann', body: 'Leg day', createdAt: t1, editedAt: null, author: ann, photos: [{ id: 'ph1', storagePath: 'ann/ph1.jpg', width: 10, height: 20 }] },
      { id: 'p1', authorId: ME, body: 'Arm day', createdAt: t2, editedAt: null, author: meUser, photos: [{ id: 'ph2', storagePath: 'me/ph2.jpg', width: 30, height: 40 }] },
    ])

    ;(signPostPhotos as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      urls: new Map([['ann/ph1.jpg', 'https://s/1'], ['me/ph2.jpg', 'https://s/2']]),
      expiresAt: '2026-09-30T12:15:00.000Z',
    })

    const result = await call()

    expect(mockFollowingIdsOf).toHaveBeenCalledWith(ME)
    // Every photo on the page is signed in a single storage call.
    expect(signPostPhotos).toHaveBeenCalledTimes(1)
    expect(signPostPhotos).toHaveBeenCalledWith(['ann/ph1.jpg', 'me/ph2.jpg'])
    expect(mockFindPosts).toHaveBeenCalledWith({
      where: { authorId: { in: [ME, 'ann', 'bo'] } },
      orderBy: newestFirst,
      take: 20,
      select: expect.objectContaining({ id: true, author: expect.anything() }),
    })
    expect(result.posts).toEqual([
      { id: 'p2', author: ann, body: 'Leg day', createdAt: t1, editedAt: null, isMine: false, photos: [{ id: 'ph1', url: 'https://s/1', width: 10, height: 20 }], photosExpireAt: '2026-09-30T12:15:00.000Z', reactions: [] },
      { id: 'p1', author: meUser, body: 'Arm day', createdAt: t2, editedAt: null, isMine: true, photos: [{ id: 'ph2', url: 'https://s/2', width: 30, height: 40 }], photosExpireAt: '2026-09-30T12:15:00.000Z', reactions: [] },
    ])
  })

  // followingIdsOf counts ACCEPTED follows only (tested in follows.test.ts), so
  // pending requests and PUBLIC strangers never reach the author list — and
  // since no other filter is applied, the author list IS the visibility rule.
  test('applies no visibility or block filter beyond the author list', async () => {
    mockFollowingIdsOf.mockResolvedValueOnce(['ann'])

    await call()

    expect(Object.keys(mockFindPosts.mock.calls[0]![0].where)).toEqual(['authorId'])
  })

  test('following nobody → only my own posts (the query still runs)', async () => {
    await call()

    expect(mockFindPosts.mock.calls[0]![0].where).toEqual({ authorId: { in: [ME] } })
  })

  test('pages past the cursor with the id tiebreak and the requested limit', async () => {
    mockFollowingIdsOf.mockResolvedValueOnce(['ann'])

    await call({ limit: '5', before: '2026-09-30T12:00:00.000Z', beforeId: 'p9' })

    expect(mockFindPosts).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        authorId: { in: [ME, 'ann'] },
        OR: [{ createdAt: { lt: t1 } }, { createdAt: t1, id: { lt: 'p9' } }],
      },
      take: 5,
    }))
  })

  test.each([
    [{ limit: 'ten' }, 'Invalid limit'],
    [{ before: '2026-09-30T12:00:00.000Z' }, 'before and beforeId must be provided together'],
    [{ before: 'soon', beforeId: 'p1' }, 'Invalid before timestamp'],
  ])('400 on bad pagination %o — same messages as History — before any query', async (query, statusMessage) => {
    await expect(call(query)).rejects.toMatchObject({ statusCode: 400, statusMessage })
    expect(mockFollowingIdsOf).not.toHaveBeenCalled()
  })

  test('500 with a generic message on a database error', async () => {
    mockFindPosts.mockRejectedValueOnce(new Error('timeout'))
    await expect(call()).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch feed' })
    expect(logger.error).toHaveBeenCalled()
  })
})
