import type { Prisma } from '@prisma/client'

/**
 * Follow helpers shared by the social routes (docs/social/SPEC-follows.md).
 * A Follow row is directed (follower → followee): PENDING is a request to a
 * PRIVATE profile, ACCEPTED is a follow. Removal deletes the row.
 */

/** The Follow fields every follow route reads. */
export const followSelect = {
  id: true,
  followerId: true,
  followeeId: true,
  status: true,
  createdAt: true,
  acceptedAt: true,
} satisfies Prisma.FollowSelect

export type FollowState = 'none' | 'requested' | 'following'

/** The caller's relationship to another user, in both directions. */
export interface Relationship {
  isSelf: boolean
  outgoing: FollowState
  incoming: FollowState
  /** Set while they have a pending request to the caller, so it can be accepted from their profile. */
  incomingRequestId: string | null
}

const stateOf = (status: 'PENDING' | 'ACCEPTED'): FollowState => (status === 'ACCEPTED' ? 'following' : 'requested')

/**
 * True if `viewerId` has an ACCEPTED follow of `authorId`. Pass the transaction
 * client when the check must be consistent with a write under `withPairLock`.
 */
export async function isFollowing(viewerId: string, authorId: string, db: Prisma.TransactionClient = prisma): Promise<boolean> {
  const row = await db.follow.findUnique({
    where: { followerId_followeeId: { followerId: viewerId, followeeId: authorId } },
    select: { status: true },
  })
  return row?.status === 'ACCEPTED'
}

/** Relationship of `me` to each of `userIds`, resolved in at most one query. */
export async function followStatesWith(me: string, userIds: string[]): Promise<Map<string, Relationship>> {
  const result = new Map<string, Relationship>()
  for (const id of userIds) {
    result.set(id, { isSelf: id === me, outgoing: 'none', incoming: 'none', incomingRequestId: null })
  }

  const others = [...new Set(userIds)].filter((id) => id !== me)
  if (others.length === 0) return result

  const rows = await prisma.follow.findMany({
    where: {
      OR: [
        { followerId: me, followeeId: { in: others } },
        { followeeId: me, followerId: { in: others } },
      ],
    },
    select: { id: true, followerId: true, followeeId: true, status: true },
  })

  for (const row of rows) {
    if (row.followerId === me) {
      result.get(row.followeeId)!.outgoing = stateOf(row.status)
    } else {
      const rel = result.get(row.followerId)!
      rel.incoming = stateOf(row.status)
      if (row.status === 'PENDING') rel.incomingRequestId = row.id
    }
  }
  return result
}

/** Ids of everyone `me` follows (ACCEPTED only) — the feed's author list. */
export async function followingIdsOf(me: string): Promise<string[]> {
  const rows = await prisma.follow.findMany({
    where: { followerId: me, status: 'ACCEPTED' },
    select: { followeeId: true },
  })
  return rows.map((r) => r.followeeId)
}
