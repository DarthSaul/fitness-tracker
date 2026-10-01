import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './search.get'

const mockGetQuery = getQuery as ReturnType<typeof vi.fn>
const mockFindMany = prisma.user.findMany as ReturnType<typeof vi.fn>
const mockBlockedUserIds = blockedUserIds as ReturnType<typeof vi.fn>
const mockRateLimitByKey = rateLimitByKey as ReturnType<typeof vi.fn>
const mockFollowStatesWith = followStatesWith as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }
type Result = { users: Record<string, unknown>[] }

function call(q: unknown) {
  mockGetQuery.mockReturnValue(q === undefined ? {} : { q })
  return (handler as unknown as (e: Event) => Promise<Result>)({ path: '/api/users/search', context: { userId: 'alice' } })
}

const publicSelect = { id: true, name: true, avatarUrl: true, profileVisibility: true }
const none = { isSelf: false, outgoing: 'none', incoming: 'none', incomingRequestId: null }

describe('GET /api/users/search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindMany.mockResolvedValue([])
    mockBlockedUserIds.mockResolvedValue([])
    mockRateLimitByKey.mockResolvedValue(undefined)
    mockFollowStatesWith.mockResolvedValue(new Map())
  })

  test('matches names case-insensitively by substring, capped at 20, public fields only', async () => {
    const users = [{ id: 'bob', name: 'Bob Smith', avatarUrl: null }]
    mockFindMany.mockResolvedValueOnce(users)
    mockFollowStatesWith.mockResolvedValueOnce(new Map([['bob', none]]))

    const result = await call('  smi ')

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { name: { contains: 'smi', mode: 'insensitive' }, id: { notIn: ['alice'] } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 20,
      select: publicSelect,
    })
    expect(result).toEqual({ users: [{ ...users[0], ...none }] })
  })

  test("annotates every result with the caller's follow state, both directions, in one lookup", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 'bob', name: 'Bob', avatarUrl: null },
      { id: 'cat', name: 'Cat', avatarUrl: null },
    ])
    mockFollowStatesWith.mockResolvedValueOnce(new Map<string, object>([
      ['bob', { ...none, outgoing: 'following', incoming: 'following' }],
      ['cat', { ...none, incoming: 'requested', incomingRequestId: 'f9' }],
    ]))

    const result = await call('ca')

    expect(mockFollowStatesWith).toHaveBeenCalledTimes(1)
    expect(mockFollowStatesWith).toHaveBeenCalledWith('alice', ['bob', 'cat'])
    expect(result.users).toEqual([
      { id: 'bob', name: 'Bob', avatarUrl: null, ...none, outgoing: 'following', incoming: 'following' },
      { id: 'cat', name: 'Cat', avatarUrl: null, ...none, incoming: 'requested', incomingRequestId: 'f9' },
    ])
  })

  test('a query containing @ matches the email exactly (case-insensitive), never by prefix', async () => {
    await call('Bob@Example.com')

    expect(mockFindMany.mock.calls[0]![0].where).toEqual({
      email: { equals: 'Bob@Example.com', mode: 'insensitive' },
      id: { notIn: ['alice'] },
    })
  })

  test('excludes the caller and every user blocked in either direction', async () => {
    mockBlockedUserIds.mockResolvedValueOnce(['mallory', 'trent'])

    await call('bo')

    expect(mockBlockedUserIds).toHaveBeenCalledWith('alice')
    expect(mockFindMany.mock.calls[0]![0].where.id).toEqual({ notIn: ['alice', 'mallory', 'trent'] })
  })

  test('rate-limits per user, not per IP', async () => {
    await call('bo')
    expect(mockRateLimitByKey).toHaveBeenCalledWith('user-search:alice', 30, '1 m')
  })

  test('429 from the rate limiter propagates without querying', async () => {
    mockRateLimitByKey.mockRejectedValueOnce(Object.assign(new Error('Too many requests'), { statusCode: 429 }))

    await expect(call('bo')).rejects.toMatchObject({ statusCode: 429 })
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  test.each([
    ['missing', undefined],
    ['non-string', ['bo', 'b']],
    ['one character after trimming', ' b '],
    ['over 100 characters', 'x'.repeat(101)],
  ])('400 when q is %s', async (_label, q) => {
    await expect(call(q)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  test('accepts exactly 2 and exactly 100 characters', async () => {
    await expect(call('bo')).resolves.toEqual({ users: [] })
    await expect(call('x'.repeat(100))).resolves.toEqual({ users: [] })
  })

  test('500 with a generic message on a database error', async () => {
    mockFindMany.mockRejectedValueOnce(new Error('timeout'))

    await expect(call('bo')).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to search users' })
    expect(logger.error).toHaveBeenCalled()
  })
})
