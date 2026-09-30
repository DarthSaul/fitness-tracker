defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Unblock a user',
    description: 'Removes a block the authenticated user made. Idempotent: 204 even if no block existed. Unblocking does not restore a friendship.',
    responses: {
      204: { description: 'User unblocked (or was not blocked)' },
      400: { description: 'Missing userId' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const targetId = getRouterParam(event, 'userId')?.trim()
  if (!targetId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing userId' })
  }

  try {
    await prisma.userBlock.deleteMany({ where: { blockerId: userId, blockedId: targetId } })
    event.node.res.statusCode = 204
    return null
  } catch (error) {
    ;(event.context.logger ?? logger).error({ err: error, route: 'DELETE /api/blocks/:userId' }, '[DELETE /api/blocks/:userId] Failed to unblock user')
    throw createError({ statusCode: 500, statusMessage: 'Failed to unblock user' })
  }
})
