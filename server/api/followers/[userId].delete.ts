defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Remove a follower',
    description:
      "Removes a user's accepted follow of the caller. On a PRIVATE profile this revokes their access to the caller's "
      + 'posts on their next request. Idempotent: 204 even if they were not a follower. Pending requests are declined via '
      + 'DELETE /api/follow-requests/:id.',
    responses: {
      204: { description: 'Follower removed (or was not a follower)' },
      400: { description: 'Missing userId' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const followerId = getRouterParam(event, 'userId')?.trim()
  if (!followerId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing userId' })
  }

  try {
    await prisma.follow.deleteMany({ where: { followerId, followeeId: userId, status: 'ACCEPTED' } })
    event.node.res.statusCode = 204
    return null
  } catch (error) {
    ;(event.context.logger ?? logger).error({ err: error, route: 'DELETE /api/followers/:userId' }, '[DELETE /api/followers/:userId] Failed to remove follower')
    throw createError({ statusCode: 500, statusMessage: 'Failed to remove follower' })
  }
})
