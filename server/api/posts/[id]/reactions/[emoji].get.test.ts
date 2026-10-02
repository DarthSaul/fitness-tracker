import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[emoji].get'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockGetQuery = getQuery as ReturnType<typeof vi.fn>
const mockRequireVisible = requireVisiblePost as ReturnType<typeof vi.fn>
const mockBlockedUserIds = blockedUserIds as ReturnType<typeof vi.fn>
const mockFollowStatesWith = followStatesWith as ReturnType<typeof vi.fn>
const mockFindMany = prisma.postReaction.findMany as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }
type Result = { users: Record<string, unknown>[] }

const t1 = new Date('2026-10-01T12:00:00.000Z')
const t2 = new Date('2026-10-01T11:00:00.000Z')
const ann = { id: 'ann', name: 'Ann', avatarUrl: null, profileVisibility: 'PRIVATE' }
const me = { id: 'me', name: 'Me', avatarUrl: null, profileVisibility: 'PUBLIC' }
const none = { isSelf: false, outgoing: 'none', incoming: 'none', incomingRequestId: null }

function call(query: Record<string, unknown> = {}, emoji = '👍', id: string | undefined = 'p1') {
  mockGetRouterParam.mockImplementation((_e: unknown, name: string, opts?: { decode?: boolean }) =>
    name === 'id' ? id : opts?.decode ? emoji : encodeURIComponent(emoji))
  mockGetQuery.mockReturnValue(query)
  return (handler as unknown as (e: Event) => Promise<Result>)({ path: '/api/posts/p1/reactions/x', context: { userId: 'me' } })
}

describe('GET /api/posts/:id/reactions/:emoji — who reacted', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireVisible.mockResolvedValue({ id: 'p1', author: { id: 'a', profileVisibility: 'PUBLIC' } })
    mockBlockedUserIds.mockResolvedValue([])
    mockFindMany.mockResolvedValue([])
    mockFollowStatesWith.mockImplementation(async (viewer: string, ids: string[]) =>
      new Map(ids.map((id) => [id, { ...none, isSelf: id === viewer }])))
  })

  test('lists reactors newest first with follow state, reactedAt and the reaction id as cursorId', async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 'r2', createdAt: t1, user: ann },
      { id: 'r1', createdAt: t2, user: me },
    ])
    mockFollowStatesWith.mockResolvedValueOnce(new Map<string, object>([
      ['ann', { ...none, outgoing: 'following' }],
      ['me', { ...none, isSelf: true }],
    ]))

    const result = await call()

    expect(mockRequireVisible).toHaveBeenCalledWith('p1', 'me')
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { postId: 'p1', emoji: '👍' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
      select: { id: true, createdAt: true, user: { select: { id: true, name: true, avatarUrl: true, profileVisibility: true, username: true } } },
    })
    expect(mockFollowStatesWith).toHaveBeenCalledWith('me', ['ann', 'me'])
    expect(result.users).toEqual([
      { ...ann, ...none, outgoing: 'following', reactedAt: t1, cursorId: 'r2' },
      { ...me, ...none, isSelf: true, reactedAt: t2, cursorId: 'r1' },
    ])
  })

  test('leaves out users blocked in either direction — the same set the counts exclude', async () => {
    mockBlockedUserIds.mockResolvedValueOnce(['blocked1'])

    await call()

    expect(mockBlockedUserIds).toHaveBeenCalledWith('me')
    expect(mockFindMany.mock.calls[0]![0].where).toEqual({ postId: 'p1', emoji: '👍', userId: { notIn: ['blocked1'] } })
  })

  test('pages past the cursor (reaction createdAt + id) with the id tiebreak', async () => {
    await call({ limit: '5', before: '2026-10-01T12:00:00.000Z', beforeId: 'r9' })

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { postId: 'p1', emoji: '👍', OR: [{ createdAt: { lt: t1 } }, { createdAt: t1, id: { lt: 'r9' } }] },
      take: 5,
    }))
  })

  test('decodes and normalizes the emoji (❤ lists the stored ❤️ reactors)', async () => {
    await call({}, '❤')

    expect(mockGetRouterParam).toHaveBeenCalledWith(expect.anything(), 'emoji', { decode: true })
    expect(mockFindMany.mock.calls[0]![0].where.emoji).toBe('❤️')
  })

  test('nobody reacted → an empty list, no follow lookup', async () => {
    expect(await call()).toEqual({ users: [] })
    expect(mockFollowStatesWith).toHaveBeenCalledWith('me', [])
  })

  test('404 when the caller cannot see the post — never reveals who reacted', async () => {
    mockRequireVisible.mockRejectedValueOnce(Object.assign(new Error('Post not found'), { statusCode: 404 }))

    await expect(call()).rejects.toMatchObject({ statusCode: 404 })
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  test.each([
    ['an invalid emoji', {}, 'nope'],
    ['a bad limit', { limit: 'ten' }, '👍'],
    ['before without beforeId', { before: '2026-10-01T12:00:00.000Z' }, '👍'],
  ])('400 for %s, before any query', async (_label, query, emoji) => {
    await expect(call(query, emoji)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockRequireVisible).not.toHaveBeenCalled()
  })

  test('400 when the post id is missing', async () => {
    // '' rather than undefined: undefined would fall back to the 'p1' default.
    await expect(call({}, '👍', '')).rejects.toMatchObject({ statusCode: 400 })
  })

  test('500 with a generic message on a database error', async () => {
    mockFindMany.mockRejectedValueOnce(new Error('timeout'))
    await expect(call()).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch reactions' })
    expect(logger.error).toHaveBeenCalled()
  })
})
