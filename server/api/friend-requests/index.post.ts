import type { Prisma } from '@prisma/client'

defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Send a friend request',
    description:
      'Sends a friend request. Idempotent: an existing pending request from the caller returns 200. If the other user '
      + 'already requested the caller, that request is accepted instead and the response is `{ friend }`. '
      + 'Rate-limited to 30 requests per hour per user.',
    responses: {
      201: { description: 'Request sent — `FriendRequest`' },
      200: { description: 'Request already pending (`FriendRequest`), or a crossed request was accepted (`{ friend }`)' },
      400: { description: 'Missing userId, or requesting yourself' },
      404: { description: 'User not found' },
      409: { description: 'Already friends' },
      429: { description: 'Too many requests' },
      500: { description: 'Internal server error' },
    },
  },
})

type Row = Prisma.FriendshipGetPayload<{ select: typeof friendshipSelect }>
type Response = FriendRequestResponse | { friend: Friend }

export default defineEventHandler(async (event): Promise<Response> => {
  const userId = event.context.userId as string
  const body = await readBody(event)

  const targetId = typeof body?.userId === 'string' ? body.userId.trim() : ''
  if (!targetId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing userId' })
  }
  if (targetId === userId) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot friend yourself' })
  }

  try {
    await rateLimitByKey(`friend-request:${userId}`, 30, '1 h')

    const target = await prisma.user.findUnique({ where: { id: targetId }, select: publicUserSelect })
    if (!target) throw notFound()

    const outgoing = (row: Row): FriendRequestResponse => ({ id: row.id, user: target, direction: 'outgoing', createdAt: row.createdAt })

    // Everything below holds the pair lock that POST /api/blocks also takes, so
    // a block can't land between the check and the write, and concurrent
    // requests about the same pair see each other's committed rows.
    return await withPairLock(userId, targetId, async (tx): Promise<Response> => {
      if (await isBlockedEitherWay(userId, targetId, tx)) throw notFound()

      const existing = await tx.friendship.findUnique({
        where: { userLowId_userHighId: orderedPair(userId, targetId) },
        select: friendshipSelect,
      })

      if (!existing) {
        const created = await tx.friendship.create({
          data: { ...orderedPair(userId, targetId), requesterId: userId },
          select: friendshipSelect,
        })
        event.node.res.statusCode = 201
        return outgoing(created)
      }

      if (existing.status === 'ACCEPTED') {
        throw createError({ statusCode: 409, statusMessage: 'Already friends' })
      }
      if (existing.requesterId === userId) return outgoing(existing)

      // They already asked us: treat this request as accepting theirs.
      const accepted = await tx.friendship.update({
        where: { id: existing.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
        select: friendshipSelect,
      })
      return { friend: { ...target, friendsSince: accepted.acceptedAt! } }
    })
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/friend-requests' }, '[POST /api/friend-requests] Failed to send friend request')
    throw createError({ statusCode: 500, statusMessage: 'Failed to send friend request' })
  }
})

function notFound() {
  return createError({ statusCode: 404, statusMessage: 'User not found' })
}
