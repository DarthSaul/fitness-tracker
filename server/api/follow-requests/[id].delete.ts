defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Decline or cancel a follow request',
    description: 'Removes a pending follow request the caller received (decline) or sent (cancel). The requester is not notified of a decline.',
    responses: {
      204: { description: 'Request removed' },
      400: { description: 'Missing request id' },
      404: { description: 'Follow request not found' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const id = getRouterParam(event, 'id')?.trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing request id' })
  }

  try {
    // One guarded delete: either party, only while PENDING. An accepted follow is
    // removed via DELETE /api/following/:userId or /api/followers/:userId.
    const { count } = await prisma.follow.deleteMany({
      where: { id, status: 'PENDING', OR: [{ followerId: userId }, { followeeId: userId }] },
    })
    if (count === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Follow request not found' })
    }

    event.node.res.statusCode = 204
    return null
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'DELETE /api/follow-requests/:id' }, '[DELETE /api/follow-requests/:id] Failed to remove follow request')
    throw createError({ statusCode: 500, statusMessage: 'Failed to remove follow request' })
  }
})
