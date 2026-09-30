defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Remove a friend',
    description:
      'Ends a friendship, whichever user originally sent the request. Idempotent: 204 even if not friends. '
      + "The removed friend's posts drop out of the caller's feed on the next fetch. Pending requests are unaffected — use DELETE /api/friend-requests/:id.",
    responses: {
      204: { description: 'Friend removed (or was not a friend)' },
      400: { description: 'Missing userId' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const friendId = getRouterParam(event, 'userId')?.trim()
  if (!friendId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing userId' })
  }

  try {
    await prisma.friendship.deleteMany({ where: { ...orderedPair(userId, friendId), status: 'ACCEPTED' } })
    event.node.res.statusCode = 204
    return null
  } catch (error) {
    ;(event.context.logger ?? logger).error({ err: error, route: 'DELETE /api/friends/:userId' }, '[DELETE /api/friends/:userId] Failed to remove friend')
    throw createError({ statusCode: 500, statusMessage: 'Failed to remove friend' })
  }
})
