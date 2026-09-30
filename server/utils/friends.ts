import type { Prisma } from '@prisma/client'

/**
 * Friendship helpers shared by the social routes. A `Friendship` row stores
 * its pair sorted (see the model comment in schema.prisma); this file is the
 * only place that sorts.
 */

/** The Friendship fields every friend route reads. */
export const friendshipSelect = {
  id: true,
  requesterId: true,
  status: true,
  createdAt: true,
  acceptedAt: true,
} satisfies Prisma.FriendshipSelect

/** A pending request, always described from the caller's side. */
export interface FriendRequestResponse {
  id: string
  user: PublicUser
  direction: 'incoming' | 'outgoing'
  createdAt: Date
}

export type Friend = PublicUser & { friendsSince: Date }

export type Relationship =
  | { relationship: 'self' | 'none' | 'friends' }
  | { relationship: 'request_sent' | 'request_received'; requestId: string }

/**
 * `{ userLowId, userHighId }` for a pair. Plain `<` is UTF-16 code-unit order,
 * which for ASCII cuids equals the byte order the migration's
 * `COLLATE "C"` CHECK enforces.
 */
export function orderedPair(a: string, b: string): { userLowId: string; userHighId: string } {
  return a < b ? { userLowId: a, userHighId: b } : { userLowId: b, userHighId: a }
}

/** True if `a` and `b` have an ACCEPTED friendship. */
export async function areFriends(a: string, b: string): Promise<boolean> {
  if (a === b) return false
  const row = await prisma.friendship.findUnique({
    where: { userLowId_userHighId: orderedPair(a, b) },
    select: { status: true },
  })
  return row?.status === 'ACCEPTED'
}

/** Relationship of `me` to each of `userIds`, resolved in at most one query. */
export async function relationshipsWith(me: string, userIds: string[]): Promise<Map<string, Relationship>> {
  const result = new Map<string, Relationship>()
  const others = [...new Set(userIds)].filter((id) => id !== me)

  for (const id of userIds) result.set(id, { relationship: id === me ? 'self' : 'none' })
  if (others.length === 0) return result

  const rows = await prisma.friendship.findMany({
    where: {
      OR: [
        { userLowId: me, userHighId: { in: others } },
        { userHighId: me, userLowId: { in: others } },
      ],
    },
    select: { id: true, userLowId: true, userHighId: true, requesterId: true, status: true },
  })

  for (const row of rows) {
    const other = row.userLowId === me ? row.userHighId : row.userLowId
    if (row.status === 'ACCEPTED') {
      result.set(other, { relationship: 'friends' })
    } else {
      result.set(other, { relationship: row.requesterId === me ? 'request_sent' : 'request_received', requestId: row.id })
    }
  }
  return result
}

/** `where` fragment for "users who are ACCEPTED friends of `me`" — used by the feed. */
export function friendsOf(me: string): Prisma.UserWhereInput {
  return {
    OR: [
      { friendshipsAsLow: { some: { userHighId: me, status: 'ACCEPTED' } } },
      { friendshipsAsHigh: { some: { userLowId: me, status: 'ACCEPTED' } } },
    ],
  }
}

/**
 * Runs `fn` in a transaction holding an advisory lock on the (unordered) pair,
 * so writes about the same two users are serialized. Callers:
 *   - POST /api/blocks                    (block + sever the friendship)
 *   - POST /api/friend-requests           (block check + create / crossed accept)
 *   - POST /api/friend-requests/:id/accept
 *   - DELETE /api/friend-requests/:id     (cancel / decline)
 * So a block can't land between a request's block check and its write —
 * "blocked" and "friends / pending" can never coexist — and request writes on
 * one pair never interleave. Unfriending and unblocking only remove rows and
 * can't create either inconsistency, so they don't take it.
 *
 * The lock is transaction-scoped (released on commit or rollback), which is
 * what works through Supabase's transaction-mode pooler.
 */
export async function withPairLock<T>(a: string, b: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const { userLowId, userHighId } = orderedPair(a, b)
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userLowId}::text || ':' || ${userHighId}::text, 0))`
    return fn(tx)
  })
}
