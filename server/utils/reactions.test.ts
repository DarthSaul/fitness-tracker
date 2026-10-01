import { describe, test, expect, vi, beforeEach } from 'vitest'

import { parseReactionEmoji, reactionSummaries, REACTION_CAP } from './reactions'

const mockGroupBy = prisma.postReaction.groupBy as ReturnType<typeof vi.fn>
const mockFindMany = prisma.postReaction.findMany as ReturnType<typeof vi.fn>
const mockBlockedUserIds = blockedUserIds as ReturnType<typeof vi.fn>

describe('parseReactionEmoji — exactly one emoji', () => {
  test.each([
    ['a plain emoji', '👍'],
    ['a fully-qualified emoji', '❤️'],
    ['a skin-tone modifier', '👍🏽'],
    ['a ZWJ family', '👨‍👩‍👧'],
    ['a ZWJ sequence with variation selectors', '🏋️‍♀️'],
    ['a flag', '🇬🇧'],
    ['a keycap', '1️⃣'],
  ])('accepts %s', (_label, emoji) => {
    expect(parseReactionEmoji(emoji)).toBe(emoji)
  })

  test('normalizes a bare ❤ (no U+FE0F) to ❤️, so both forms are the same reaction', () => {
    expect(parseReactionEmoji('❤')).toBe('❤️')
  })

  test.each([
    ['two emoji', '👍👍'],
    ['text', 'a'],
    ['empty', ''],
    ['leading space', ' 👍'],
    ['emoji plus text', '👍ok'],
    ['a long string', '👍'.repeat(40)],
    // Regression (PR #139 review): only a bare ❤ gets U+FE0F appended. These
    // become RGI emoji with it, but the contract rejects them.
    ['a bare © (text presentation)', '©'],
    ['a bare ™', '™'],
    ['a bare ☺', '☺'],
    ['a bare ♀', '♀'],
    ['not a string', 7],
    ['missing', undefined],
  ])('400 for %s', (_label, raw) => {
    expect(() => parseReactionEmoji(raw)).toThrow(expect.objectContaining({ statusCode: 400 }))
  })

  test('the cap is 10 distinct emoji per user per post', () => {
    expect(REACTION_CAP).toBe(10)
  })
})

describe('reactionSummaries — one page in three queries', () => {
  const t0 = new Date('2026-10-01T10:00:00.000Z')
  const t1 = new Date('2026-10-01T11:00:00.000Z')

  beforeEach(() => {
    vi.clearAllMocks()
    mockBlockedUserIds.mockResolvedValue([])
    mockGroupBy.mockResolvedValue([])
    mockFindMany.mockResolvedValue([])
  })

  test('counts per emoji, flags the caller\'s own, sorts by count then first appearance', async () => {
    mockGroupBy.mockResolvedValueOnce([
      { postId: 'p1', emoji: '🔥', _count: { _all: 2 }, _min: { createdAt: t1 } },
      { postId: 'p1', emoji: '👍', _count: { _all: 5 }, _min: { createdAt: t1 } },
      { postId: 'p1', emoji: '❤️', _count: { _all: 2 }, _min: { createdAt: t0 } },
      { postId: 'p2', emoji: '👍', _count: { _all: 1 }, _min: { createdAt: t0 } },
    ])
    mockFindMany.mockResolvedValueOnce([
      { postId: 'p1', emoji: '🔥' },
      { postId: 'p2', emoji: '👍' },
    ])

    const result = await reactionSummaries(['p1', 'p2', 'p3'], 'me')

    expect(mockBlockedUserIds).toHaveBeenCalledWith('me')
    expect(mockGroupBy).toHaveBeenCalledTimes(1)
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { postId: { in: ['p1', 'p2', 'p3'] }, userId: 'me' },
      select: { postId: true, emoji: true },
    })
    // 👍 has the most; ❤️ and 🔥 tie on 2, and ❤️ appeared first.
    expect(result.get('p1')).toEqual([
      { emoji: '👍', count: 5, mine: false },
      { emoji: '❤️', count: 2, mine: false },
      { emoji: '🔥', count: 2, mine: true },
    ])
    expect(result.get('p2')).toEqual([{ emoji: '👍', count: 1, mine: true }])
    expect(result.get('p3')).toEqual([])
  })

  test('a full tie (count and first appearance) falls back to code-point order, not the locale', async () => {
    // localeCompare puts 🇬🇧 (U+1F1EC…) before ❤️ (U+2764…); code-point order is the reverse.
    mockGroupBy.mockResolvedValueOnce([
      { postId: 'p1', emoji: '🇬🇧', _count: { _all: 1 }, _min: { createdAt: t0 } },
      { postId: 'p1', emoji: '❤️', _count: { _all: 1 }, _min: { createdAt: t0 } },
    ])

    const result = await reactionSummaries(['p1'], 'me')

    expect(result.get('p1')!.map((r) => r.emoji)).toEqual(['❤️', '🇬🇧'])
  })

  test('counts exclude users blocked in either direction, so they match the who-reacted list', async () => {
    mockBlockedUserIds.mockResolvedValueOnce(['blocked1', 'blocked2'])

    await reactionSummaries(['p1'], 'me')

    expect(mockGroupBy).toHaveBeenCalledWith({
      by: ['postId', 'emoji'],
      where: { postId: { in: ['p1'] }, userId: { notIn: ['blocked1', 'blocked2'] } },
      _count: { _all: true },
      _min: { createdAt: true },
    })
  })

  test('with no blocks, the counts are not filtered by user', async () => {
    await reactionSummaries(['p1'], 'me')

    expect(mockGroupBy.mock.calls[0]![0].where).toEqual({ postId: { in: ['p1'] } })
  })

  test('an empty page makes no queries', async () => {
    expect(await reactionSummaries([], 'me')).toEqual(new Map())
    expect(mockBlockedUserIds).not.toHaveBeenCalled()
    expect(mockGroupBy).not.toHaveBeenCalled()
    expect(mockFindMany).not.toHaveBeenCalled()
  })
})
