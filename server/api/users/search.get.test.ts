import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './search.get'

const mockGetQuery = getQuery as ReturnType<typeof vi.fn>
const mockFindMany = prisma.user.findMany as ReturnType<typeof vi.fn>
const mockFindFirst = prisma.user.findFirst as ReturnType<typeof vi.fn>
const mockBlockedUserIds = blockedUserIds as ReturnType<typeof vi.fn>
const mockRateLimitByKey = rateLimitByKey as ReturnType<typeof vi.fn>
const mockFollowStatesWith = followStatesWith as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }
type Result = { users: Record<string, unknown>[] }

function call(q: unknown) {
  mockGetQuery.mockReturnValue(q === undefined ? {} : { q })
  return (handler as unknown as (e: Event) => Promise<Result>)({ path: '/api/users/search', context: { userId: 'alice' } })
}

const publicSelect = { id: true, name: true, avatarUrl: true, profileVisibility: true, username: true }
const none = { isSelf: false, outgoing: 'none', incoming: 'none', incomingRequestId: null }

describe('GET /api/users/search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindMany.mockReset()
    mockFindFirst.mockReset()
    mockFindMany.mockResolvedValue([])
    mockFindFirst.mockResolvedValue(null)
    mockBlockedUserIds.mockResolvedValue([])
    mockRateLimitByKey.mockResolvedValue(undefined)
    mockFollowStatesWith.mockResolvedValue(new Map())
  })

  test('matches names by substring or usernames by prefix, case-insensitively, capped at 20, public fields only', async () => {
    const users = [{ id: 'bob', name: 'Bob Smith', avatarUrl: null }]
    mockFindMany.mockResolvedValueOnce(users)
    mockFollowStatesWith.mockResolvedValueOnce(new Map([['bob', none]]))

    const result = await call('  smi ')

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        OR: [{ name: { contains: 'smi', mode: 'insensitive' } }, { username: { startsWith: 'smi' } }],
        id: { notIn: ['alice'] },
      },
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

  describe('usernames', () => {
    test('a leading @ is dropped, and the username prefix is matched lowercase', async () => {
      await call(' @SAU ')

      expect(mockFindMany.mock.calls[0]![0].where).toEqual({
        OR: [{ name: { contains: 'SAU', mode: 'insensitive' } }, { username: { startsWith: 'sau' } }],
        id: { notIn: ['alice'] },
      })
    })

    test('an exact username match comes first, without a duplicate, even past the 20-result cap', async () => {
      const saul = { id: 'saul', name: 'Zed Saul', avatarUrl: null, username: 'saul' }
      mockFindMany.mockResolvedValueOnce([{ id: 'ann', name: 'Ann Saulsbury', avatarUrl: null, username: 'ann' }, saul])
      mockFindFirst.mockResolvedValueOnce(saul)

      const result = await call('@Saul')

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { username: 'saul', id: { notIn: ['alice'] } },
        select: publicSelect,
      })
      expect(result.users.map((u) => u.id)).toEqual(['saul', 'ann'])
    })

    test('the exact match respects blocks and the cap of 20', async () => {
      mockBlockedUserIds.mockResolvedValueOnce(['mallory'])
      const many = Array.from({ length: 20 }, (_, i) => ({ id: `u${i}`, name: `Saul ${i}`, avatarUrl: null, username: `saul${i}` }))
      mockFindMany.mockResolvedValueOnce(many)
      mockFindFirst.mockResolvedValueOnce({ id: 'saul', name: 'Saul', avatarUrl: null, username: 'saul' })

      const result = await call('saul')

      expect(mockFindFirst.mock.calls[0]![0].where.id).toEqual({ notIn: ['alice', 'mallory'] })
      expect(result.users).toHaveLength(20)
      expect(result.users[0]!.id).toBe('saul')
    })

    test('no exact-match lookup when the query cannot be a username', async () => {
      await call('bob smith')

      expect(mockFindFirst).not.toHaveBeenCalled()
    })

    test('"@" only at the start means a username; elsewhere it still means an exact email', async () => {
      await call('@bob@example.com')

      expect(mockFindMany.mock.calls[0]![0].where).toEqual({
        email: { equals: 'bob@example.com', mode: 'insensitive' },
        id: { notIn: ['alice'] },
      })
      expect(mockFindFirst).not.toHaveBeenCalled()
    })

    // Regression: Prisma passes contains/startsWith straight into LIKE without
    // escaping, so "_" matched any character (user_1 found userx1…) and "%%"
    // matched every user. Verified against Postgres before the fix.
    test('LIKE wildcards in q are matched literally, not as patterns', async () => {
      await call('user_1%')

      expect(mockFindMany.mock.calls[0]![0].where.OR).toEqual([
        { name: { contains: 'user\\_1\\%', mode: 'insensitive' } },
        { username: { startsWith: 'user\\_1\\%' } },
      ])
      // The exact-username lookup is an equality, so it takes the raw value.
      expect(mockFindFirst).not.toHaveBeenCalled() // "%" can't be in a username
    })

    test('a backslash in q is escaped too, so it cannot escape the next character', async () => {
      await call('a\\_b')

      expect(mockFindMany.mock.calls[0]![0].where.OR[0]).toEqual({ name: { contains: 'a\\\\\\_b', mode: 'insensitive' } })
    })

    test('400 when only one character remains after the @', async () => {
      await expect(call('@a')).rejects.toMatchObject({ statusCode: 400 })
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
