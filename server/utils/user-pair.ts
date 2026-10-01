import type { Prisma } from '@prisma/client'

/**
 * Runs `fn` in a transaction holding an advisory lock on the (unordered) pair
 * of users, so writes about the same two users are serialized. Callers:
 *   - POST /api/blocks                      (block + remove follows both ways)
 *   - POST /api/following                   (block check + follow / request)
 *   - POST /api/follow-requests/:id/accept
 *   - PUT /api/posts/:id/reactions/:emoji  (keyed on user + POST id: the cap
 *     check and insert; a post id never equals a user id, so no contention)
 * So a block can't land between a follow's block check and its write —
 * "blocked" and "following / requested" can never coexist. Unfollowing,
 * declining, removing a follower and unblocking only remove rows and can't
 * create that state, so they don't take it.
 *
 * The lock is transaction-scoped (released on commit or rollback), which is
 * what works through Supabase's transaction-mode pooler. The ids are sorted so
 * A→B and B→A contend for the same lock.
 */
export async function withPairLock<T>(a: string, b: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const [low, high] = a < b ? [a, b] : [b, a]
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${low}::text || ':' || ${high}::text, 0))`
    return fn(tx)
  })
}
