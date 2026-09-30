/**
 * Block checks shared by every social route. A block hides each user from the
 * other in both directions, so callers never need to know who blocked whom —
 * and must respond as if the hidden user or content does not exist.
 */

/** True if either user has blocked the other. */
export async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  if (a === b) return false
  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { id: true },
  })
  return block !== null
}

/** Ids of every user `userId` blocked or was blocked by — for `notIn` filters. */
export async function blockedUserIds(userId: string): Promise<string[]> {
  const rows = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  })
  const ids = new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)))
  return [...ids]
}
