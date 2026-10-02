import { Prisma } from '@prisma/client'

defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Accept a follow request',
    description: 'Accepts a pending request to follow the caller. Only the followee can accept; anything else is 404.',
    responses: {
      200: { description: 'Accepted — `{ follower }`' },
      400: { description: 'Missing request id' },
      404: { description: 'Follow request not found' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event): Promise<{ follower: PublicUser & { since: Date } }> => {
  const userId = event.context.userId as string
  const id = getRouterParam(event, 'id')?.trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing request id' })
  }

  const notFound = () => createError({ statusCode: 404, statusMessage: 'Follow request not found' })

  try {
    const request = await prisma.follow.findUnique({
      where: { id },
      select: { followerId: true, followeeId: true, status: true, follower: { select: publicUserSelect } },
    })
    if (!request || request.status !== 'PENDING' || request.followeeId !== userId) throw notFound()

    // Under the pair lock so it serializes with a block. Still guarded on
    // PENDING: it may have been cancelled between the read and the lock, which
    // fails with P2025 → 404 rather than reviving it.
    const { accepted, notification } = await withPairLock(request.followerId, userId, async (tx) => {
      const accepted = await tx.follow.update({
        where: { id, status: 'PENDING' },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
        select: { acceptedAt: true },
      })
      // The request notification would now 404 if actioned; replace it with
      // one telling the requester.
      await retract(tx, { followId: id })
      const notification = await notify(tx, {
        recipientId: request.followerId,
        actorId: userId,
        type: 'FOLLOW_ACCEPTED',
        dedupeKey: notificationKeys.followAccepted(id),
      })
      return { accepted, notification }
    })

    pushAfterCommit(event, notification)
    return { follower: { ...request.follower, since: accepted.acceptedAt! } }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw notFound()
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/follow-requests/:id/accept' }, '[POST /api/follow-requests/:id/accept] Failed to accept follow request')
    throw createError({ statusCode: 500, statusMessage: 'Failed to accept follow request' })
  }
})
