defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Cancel or decline a friend request',
    description: 'Removes a pending request the caller sent (cancel) or received (decline). The requester is not notified of a decline.',
    responses: {
      204: { description: 'Request removed' },
      400: { description: 'Missing request id' },
      404: { description: 'Friend request not found' },
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
    // One guarded delete: either party may remove it, but only while PENDING —
    // an accepted friendship is removed via DELETE /api/friends/:userId.
    const { count } = await prisma.friendship.deleteMany({
      where: { id, status: 'PENDING', OR: [{ userLowId: userId }, { userHighId: userId }] },
    })
    if (count === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Friend request not found' })
    }

    event.node.res.statusCode = 204
    return null
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'DELETE /api/friend-requests/:id' }, '[DELETE /api/friend-requests/:id] Failed to remove friend request')
    throw createError({ statusCode: 500, statusMessage: 'Failed to remove friend request' })
  }
})
