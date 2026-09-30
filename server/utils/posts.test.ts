import { describe, test, expect, vi, beforeEach } from 'vitest'

import { canViewPost, toPost, parsePageQuery, pageWhere, parsePostBody, parseVisibility, postSelect } from './posts'

const mockIsBlocked = isBlockedEitherWay as ReturnType<typeof vi.fn>
const mockAreFriends = areFriends as ReturnType<typeof vi.fn>

describe('canViewPost — the visibility rule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsBlocked.mockResolvedValue(false)
    mockAreFriends.mockResolvedValue(false)
  })

  test.each([
    // [label, visibility, blocked, friends, expected]
    ['a stranger sees a PUBLIC post', 'PUBLIC', false, false, true],
    ['a stranger does not see a FRIENDS post', 'FRIENDS', false, false, false],
    ['a friend sees a FRIENDS post', 'FRIENDS', false, true, true],
    ['a friend sees a PUBLIC post', 'PUBLIC', false, true, true],
    ['a blocked user does not see a PUBLIC post', 'PUBLIC', true, false, false],
    ['a blocked user does not see a FRIENDS post, even if a stale friendship existed', 'FRIENDS', true, true, false],
  ] as const)('%s', async (_label, visibility, blocked, friends, expected) => {
    mockIsBlocked.mockResolvedValue(blocked)
    mockAreFriends.mockResolvedValue(friends)

    expect(await canViewPost('viewer', { authorId: 'author', visibility })).toBe(expected)
  })

  test('the author always sees their own post, without any lookups', async () => {
    expect(await canViewPost('author', { authorId: 'author', visibility: 'FRIENDS' })).toBe(true)
    expect(mockIsBlocked).not.toHaveBeenCalled()
    expect(mockAreFriends).not.toHaveBeenCalled()
  })

  test('a PUBLIC post skips the friendship lookup', async () => {
    await canViewPost('viewer', { authorId: 'author', visibility: 'PUBLIC' })
    expect(mockAreFriends).not.toHaveBeenCalled()
  })
})

describe('toPost', () => {
  const row = {
    id: 'p1',
    authorId: 'author',
    body: 'Leg day',
    visibility: 'FRIENDS' as const,
    createdAt: new Date('2026-09-30T12:00:00.000Z'),
    editedAt: null,
    author: { id: 'author', name: 'Ada', avatarUrl: null },
  }

  test('builds the payload without leaking authorId, and flags isMine for the author', () => {
    expect(toPost(row, 'author')).toEqual({
      id: 'p1',
      author: { id: 'author', name: 'Ada', avatarUrl: null },
      body: 'Leg day',
      visibility: 'FRIENDS',
      createdAt: row.createdAt,
      editedAt: null,
      isMine: true,
    })
    expect(toPost(row, 'someone-else').isMine).toBe(false)
  })

  test('postSelect selects the author as a PublicUser only', () => {
    expect(postSelect.author).toEqual({ select: { id: true, name: true, avatarUrl: true } })
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

describe('parseVisibility', () => {
  test('accepts PUBLIC and FRIENDS', () => {
    expect(parseVisibility('PUBLIC')).toBe('PUBLIC')
    expect(parseVisibility('FRIENDS')).toBe('FRIENDS')
  })

  test.each([['lowercase', 'public'], ['unknown', 'EVERYONE'], ['not a string', 1], ['null', null]])('400 when %s', (_label, raw) => {
    expect(() => parseVisibility(raw)).toThrow(expect.objectContaining({ statusCode: 400 }))
  })
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
