import { describe, test, expect, vi, beforeEach } from 'vitest'

import { canViewPostsBy, toPost, parsePageQuery, pageWhere, parsePostBody, postSelect } from './posts'

const mockIsBlocked = isBlockedEitherWay as ReturnType<typeof vi.fn>
const mockIsFollowing = isFollowing as ReturnType<typeof vi.fn>

describe('canViewPostsBy — the visibility rule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsBlocked.mockResolvedValue(false)
    mockIsFollowing.mockResolvedValue(false)
  })

  test.each([
    // [label, profile, blocked, accepted follower, expected]
    ['a stranger sees a PUBLIC profile', 'PUBLIC', false, false, true],
    ['a stranger does not see a PRIVATE profile', 'PRIVATE', false, false, false],
    ['an accepted follower sees a PRIVATE profile', 'PRIVATE', false, true, true],
    ['a follower sees a PUBLIC profile', 'PUBLIC', false, true, true],
    ['a blocked user does not see a PUBLIC profile', 'PUBLIC', true, false, false],
    ['a blocked user does not see a PRIVATE profile, even with a stale follow', 'PRIVATE', true, true, false],
  ] as const)('%s', async (_label, profileVisibility, blocked, following, expected) => {
    mockIsBlocked.mockResolvedValue(blocked)
    mockIsFollowing.mockResolvedValue(following)

    expect(await canViewPostsBy('viewer', { id: 'author', profileVisibility })).toBe(expected)
  })

  test('a pending request is not enough: isFollowing is the ACCEPTED check', async () => {
    await canViewPostsBy('viewer', { id: 'author', profileVisibility: 'PRIVATE' })
    expect(mockIsFollowing).toHaveBeenCalledWith('viewer', 'author')
  })

  test('the author always sees their own posts, without any lookups', async () => {
    expect(await canViewPostsBy('author', { id: 'author', profileVisibility: 'PRIVATE' })).toBe(true)
    expect(mockIsBlocked).not.toHaveBeenCalled()
    expect(mockIsFollowing).not.toHaveBeenCalled()
  })

  test('a PUBLIC profile skips the follow lookup', async () => {
    await canViewPostsBy('viewer', { id: 'author', profileVisibility: 'PUBLIC' })
    expect(mockIsFollowing).not.toHaveBeenCalled()
  })
})

describe('toPost', () => {
  const row = {
    id: 'p1',
    authorId: 'author',
    body: 'Leg day',
    createdAt: new Date('2026-09-30T12:00:00.000Z'),
    editedAt: null,
    author: { id: 'author', name: 'Ada', avatarUrl: null, profileVisibility: 'PRIVATE' as const },
  }

  test('builds the payload without leaking authorId, and flags isMine for the author', () => {
    expect(toPost(row, 'author')).toEqual({
      id: 'p1',
      author: { id: 'author', name: 'Ada', avatarUrl: null, profileVisibility: 'PRIVATE' },
      body: 'Leg day',
      createdAt: row.createdAt,
      editedAt: null,
      isMine: true,
    })
    expect(toPost(row, 'someone-else').isMine).toBe(false)
  })

  test('postSelect selects the author as a PublicUser only', () => {
    expect(postSelect.author).toEqual({ select: { id: true, name: true, avatarUrl: true, profileVisibility: true } })
  })

  test('postSelect has no per-post visibility — privacy is per profile', () => {
    expect(postSelect).not.toHaveProperty('visibility')
  })
})

describe('parsePostBody', () => {
  test('trims and accepts 1–2000 characters', () => {
    expect(parsePostBody('  hi  ')).toBe('hi')
    expect(parsePostBody('x'.repeat(2000))).toHaveLength(2000)
  })

  test.each([['empty', ''], ['whitespace', '   '], ['too long', 'x'.repeat(2001)], ['not a string', 5], ['missing', undefined]])(
    '400 when %s',
    (_label, raw) => {
      expect(() => parsePostBody(raw)).toThrow(expect.objectContaining({ statusCode: 400 }))
    },
  )
})

describe('parsePageQuery — same contract as GET /api/history', () => {
  test('defaults to 20 with no cursor', () => {
    expect(parsePageQuery({})).toEqual({ limit: 20 })
  })

  test('clamps limit to 1–50', () => {
    expect(parsePageQuery({ limit: '0' }).limit).toBe(1)
    expect(parsePageQuery({ limit: '500' }).limit).toBe(50)
    expect(parsePageQuery({ limit: '7' }).limit).toBe(7)
  })

  test('parses before + beforeId together', () => {
    expect(parsePageQuery({ before: '2026-09-30T12:00:00.000Z', beforeId: 'p9' })).toEqual({
      limit: 20,
      before: { createdAt: new Date('2026-09-30T12:00:00.000Z'), id: 'p9' },
    })
  })

  test.each([
    ['a non-numeric limit', { limit: '5x' }, 'Invalid limit'],
    ['a negative limit', { limit: '-1' }, 'Invalid limit'],
    ['before without beforeId', { before: '2026-09-30T12:00:00.000Z' }, 'before and beforeId must be provided together'],
    ['beforeId without before', { beforeId: 'p9' }, 'before and beforeId must be provided together'],
    ['an empty before', { before: '', beforeId: 'p9' }, 'Invalid before'],
    ['an empty beforeId', { before: '2026-09-30T12:00:00.000Z', beforeId: '' }, 'Invalid beforeId'],
    ['an unparseable before', { before: 'yesterday', beforeId: 'p9' }, 'Invalid before timestamp'],
  ])('400 on %s', (_label, query, message) => {
    expect(() => parsePageQuery(query)).toThrow(expect.objectContaining({ statusCode: 400, statusMessage: message }))
  })
})

describe('pageWhere', () => {
  test('no cursor → no constraint', () => {
    expect(pageWhere(undefined)).toEqual({})
  })

  test('cursor → strictly older, with the id tiebreak for equal timestamps', () => {
    const createdAt = new Date('2026-09-30T12:00:00.000Z')
    expect(pageWhere({ createdAt, id: 'p9' })).toEqual({
      OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: 'p9' } }],
    })
  })
})
