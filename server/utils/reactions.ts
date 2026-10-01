/**
 * Emoji reactions on posts (docs/social/SPEC-reactions.md). A user may add
 * several different emoji to one post, each once, up to REACTION_CAP.
 */

/** At most this many distinct emoji per user per post. */
export const REACTION_CAP = 10

export interface ReactionSummary {
  emoji: string
  count: number
  /** Whether the caller reacted with this emoji. */
  mine: boolean
}

// Exactly one emoji as Unicode defines it (RGI): covers skin tones, ZWJ
// sequences, flags and keycaps. Needs the `v` flag (Node 20+).
const SINGLE_EMOJI = /^\p{RGI_Emoji}$/v
// Longer than any RGI emoji (the longest is ~35 bytes); rejects junk early.
const MAX_INPUT_LENGTH = 32

/**
 * Validate and normalize a reaction. A bare emoji missing its presentation
 * selector (❤ U+2764) is stored fully qualified (❤️) when that makes it a valid
 * emoji, so clients sending either form count as the same reaction.
 * @throws {H3Error} 400 unless the input is exactly one emoji.
 */
export function parseReactionEmoji(raw: unknown): string {
  if (typeof raw === 'string' && raw.length > 0 && raw.length <= MAX_INPUT_LENGTH) {
    if (SINGLE_EMOJI.test(raw)) return raw
    const qualified = `${raw}️`
    if (SINGLE_EMOJI.test(qualified)) return qualified
  }
  throw createError({ statusCode: 400, statusMessage: 'Reaction must be a single emoji' })
}

/**
 * Reaction summaries for a page of posts the caller may see, in three queries
 * however many posts the page holds. Counts EXCLUDE users blocked in either
 * direction, so every count equals what the caller's who-reacted list shows —
 * a count that included a hidden user would reveal the block.
 * Order: most-used first, ties by the order each emoji first appeared.
 */
export async function reactionSummaries(postIds: string[], viewerId: string): Promise<Map<string, ReactionSummary[]>> {
  const result = new Map<string, ReactionSummary[]>()
  if (postIds.length === 0) return result
  for (const id of postIds) result.set(id, [])

  const blocked = await blockedUserIds(viewerId)
  const [groups, mine] = await Promise.all([
    prisma.postReaction.groupBy({
      by: ['postId', 'emoji'],
      where: { postId: { in: postIds }, ...(blocked.length > 0 ? { userId: { notIn: blocked } } : {}) },
      _count: { _all: true },
      _min: { createdAt: true },
    }),
    prisma.postReaction.findMany({
      where: { postId: { in: postIds }, userId: viewerId },
      select: { postId: true, emoji: true },
    }),
  ])

  const mineKeys = new Set(mine.map((r) => `${r.postId}\u0000${r.emoji}`))
  const sorted = [...groups].sort((a, b) =>
    b._count._all - a._count._all
    || (a._min.createdAt?.getTime() ?? 0) - (b._min.createdAt?.getTime() ?? 0)
    || a.emoji.localeCompare(b.emoji))

  for (const g of sorted) {
    result.get(g.postId)?.push({ emoji: g.emoji, count: g._count._all, mine: mineKeys.has(`${g.postId}\u0000${g.emoji}`) })
  }
  return result
}
