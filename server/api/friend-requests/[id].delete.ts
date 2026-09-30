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

const notFound = () => createError({ statusCode: 404, statusMessage: 'Friend request not found' })

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const id = getRouterParam(event, 'id')?.trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing request id' })
  }

  try {
    const row = await prisma.friendship.findUnique({
      where: { id },
      select: { userLowId: true, userHighId: true, status: true },
    })
    const isMine = row && (row.userLowId === userId || row.userHighId === userId)
    // Either party may remove it, but only while PENDING — an accepted
    // friendship is removed via DELETE /api/friends/:userId.
    if (!row || row.status !== 'PENDING' || !isMine) throw notFound()

    // Under the pair lock so it can't delete a row out from under a concurrent
    // crossed request that is accepting it. Still guarded, since the row may
    // have changed between the read above and taking the lock.
    const { count } = await withPairLock(row.userLowId, row.userHighId, (tx) => tx.friendship.deleteMany({
      where: { id, status: 'PENDING', OR: [{ userLowId: userId }, { userHighId: userId }] },
    }))
    if (count === 0) throw notFound()

    event.node.res.statusCode = 204
    return null
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'DELETE /api/friend-requests/:id' }, '[DELETE /api/friend-requests/:id] Failed to remove friend request')
    throw createError({ statusCode: 500, statusMessage: 'Failed to remove friend request' })
  }
})
