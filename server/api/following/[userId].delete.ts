defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Unfollow a user',
    description:
      'Removes the caller\'s follow of a user, accepted or pending, so it also cancels a follow request. Idempotent: 204 '
      + "even if not following. Their posts leave the caller's feed on the next fetch.",
    responses: {
      204: { description: 'Unfollowed (or was not following)' },
      400: { description: 'Missing userId' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const followeeId = getRouterParam(event, 'userId')?.trim()
  if (!followeeId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing userId' })
  }

  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.follow.deleteMany({ where: { followerId: userId, followeeId } })
      // Cancelling a pending request withdraws its notification. After an
      // accepted follow there is none left (accepting retracted it).
      if (count > 0) await retract(tx, { dedupeKey: notificationKeys.followRequest(userId, followeeId) })
    })
    event.node.res.statusCode = 204
    return null
  } catch (error) {
    ;(event.context.logger ?? logger).error({ err: error, route: 'DELETE /api/following/:userId' }, '[DELETE /api/following/:userId] Failed to unfollow user')
    throw createError({ statusCode: 500, statusMessage: 'Failed to unfollow user' })
  }
})
