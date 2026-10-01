import { describe, test, expect, vi, beforeEach } from 'vitest'

import { isFollowing, followStatesWith, followingIdsOf } from './follows'

const mockFindUnique = prisma.follow.findUnique as ReturnType<typeof vi.fn>
const mockFindMany = prisma.follow.findMany as ReturnType<typeof vi.fn>

describe('isFollowing', () => {
  beforeEach(() => vi.clearAllMocks())

  test('looks up the directed row viewer → author', async () => {
    mockFindUnique.mockResolvedValueOnce(null)

    await isFollowing('viewer', 'author')

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { followerId_followeeId: { followerId: 'viewer', followeeId: 'author' } },
      select: { status: true },
    })
  })

  test.each([
    ['an ACCEPTED follow', { status: 'ACCEPTED' }, true],
    ['a PENDING request', { status: 'PENDING' }, false],
    ['no row', null, false],
  ])('%s → %s', async (_label, row, expected) => {
    mockFindUnique.mockResolvedValueOnce(row)
    expect(await isFollowing('viewer', 'author')).toBe(expected)
  })

  test('runs on the given transaction client when one is passed', async () => {
    const tx = { follow: { findUnique: vi.fn().mockResolvedValue({ status: 'ACCEPTED' }) } }

    expect(await isFollowing('viewer', 'author', tx as never)).toBe(true)
    expect(mockFindUnique).not.toHaveBeenCalled()
  })
})

describe('followStatesWith', () => {
  beforeEach(() => vi.clearAllMocks())

  test('resolves both directions for every user in one query', async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 'f1', followerId: 'me', followeeId: 'ann', status: 'ACCEPTED' }, // I follow Ann
      { id: 'f2', followerId: 'ann', followeeId: 'me', status: 'ACCEPTED' }, // Ann follows me
      { id: 'f3', followerId: 'me', followeeId: 'bo', status: 'PENDING' }, // I requested Bo
      { id: 'f4', followerId: 'cy', followeeId: 'me', status: 'PENDING' }, // Cy requested me
    ])

    const result = await followStatesWith('me', ['ann', 'bo', 'cy', 'dee', 'me'])

    expect(mockFindMany).toHaveBeenCalledTimes(1)
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { followerId: 'me', followeeId: { in: ['ann', 'bo', 'cy', 'dee'] } },
          { followeeId: 'me', followerId: { in: ['ann', 'bo', 'cy', 'dee'] } },
        ],
      },
      select: { id: true, followerId: true, followeeId: true, status: true },
    })
    expect(Object.fromEntries(result)).toEqual({
      ann: { isSelf: false, outgoing: 'following', incoming: 'following', incomingRequestId: null },
      bo: { isSelf: false, outgoing: 'requested', incoming: 'none', incomingRequestId: null },
      cy: { isSelf: false, outgoing: 'none', incoming: 'requested', incomingRequestId: 'f4' },
      dee: { isSelf: false, outgoing: 'none', incoming: 'none', incomingRequestId: null },
      me: { isSelf: true, outgoing: 'none', incoming: 'none', incomingRequestId: null },
    })
  })

  test('skips the query when there is nobody but the caller', async () => {
    const result = await followStatesWith('me', ['me'])

    expect(mockFindMany).not.toHaveBeenCalled()
    expect(result.get('me')?.isSelf).toBe(true)
  })

  test('deduplicates ids', async () => {
    mockFindMany.mockResolvedValueOnce([])

    await followStatesWith('me', ['ann', 'ann'])

    expect(mockFindMany.mock.calls[0]![0].where.OR[0].followeeId.in).toEqual(['ann'])
  })
})

describe('followingIdsOf', () => {
  beforeEach(() => vi.clearAllMocks())

  test('returns the users I follow with an ACCEPTED row, never pending requests', async () => {
    mockFindMany.mockResolvedValueOnce([{ followeeId: 'ann' }, { followeeId: 'bo' }])

    expect(await followingIdsOf('me')).toEqual(['ann', 'bo'])
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { followerId: 'me', status: 'ACCEPTED' },
      select: { followeeId: true },
    })
  })
})
