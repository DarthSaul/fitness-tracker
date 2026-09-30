import { Prisma } from '@prisma/client'

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

  const pair = orderedPair(userId, targetId)

  try {
    await rateLimitByKey(`friend-request:${userId}`, 30, '1 h')

    const target = await prisma.user.findUnique({ where: { id: targetId }, select: publicUserSelect })
    if (!target || (await isBlockedEitherWay(userId, targetId))) {
      throw createError({ statusCode: 404, statusMessage: 'User not found' })
    }

    const outgoing = (row: Row): FriendRequestResponse => ({ id: row.id, user: target, direction: 'outgoing', createdAt: row.createdAt })

    // Applies the rules to whatever row exists now. Returns null only when a
    // concurrent request changed the pair under us, so the caller re-reads.
    const resolve = async (): Promise<Response | null> => {
      const existing = await prisma.friendship.findUnique({ where: { userLowId_userHighId: pair }, select: friendshipSelect })

      if (!existing) {
        try {
          const created = await prisma.friendship.create({ data: { ...pair, requesterId: userId }, select: friendshipSelect })
          event.node.res.statusCode = 201
          return outgoing(created)
        } catch (err) {
          if (isRace(err)) return null
          throw err
        }
      }

      if (existing.status === 'ACCEPTED') {
        throw createError({ statusCode: 409, statusMessage: 'Already friends' })
      }
      if (existing.requesterId === userId) return outgoing(existing)

      // They already asked us: treat this request as accepting theirs.
      try {
        const accepted = await prisma.friendship.update({
          where: { id: existing.id, status: 'PENDING' },
          data: { status: 'ACCEPTED', acceptedAt: new Date() },
          select: friendshipSelect,
        })
        return { friend: { ...target, friendsSince: accepted.acceptedAt! } }
      } catch (err) {
        if (isRace(err)) return null
        throw err
      }
    }

    const result = (await resolve()) ?? (await resolve())
    if (!result) throw new Error('Friendship pair changed twice during one request')
    return result
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/friend-requests' }, '[POST /api/friend-requests] Failed to send friend request')
    throw createError({ statusCode: 500, statusMessage: 'Failed to send friend request' })
  }
})

/** P2002: someone created the pair first. P2025: the pending row we meant to accept is gone. */
function isRace(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && (err.code === 'P2002' || err.code === 'P2025')
}
