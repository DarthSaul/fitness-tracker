defineRouteMeta({
  openAPI: {
    tags: ['Devices'],
    summary: 'Unregister device token',
    description:
      'Soft-deletes one of the caller\'s device tokens by setting revokedAt. Idempotent: a token that is '
      + 'missing, already revoked or owned by another user is left untouched and still returns 204, so '
      + 'sign-out never fails on this call.',
    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
    responses: {
      204: { description: 'Device token unregistered, or there was nothing of the caller\'s to unregister' },
      400: { description: 'id is required' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const id = getRouterParam(event, 'id')

  if (!id?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'id is required' })
  }

  try {
    // Scoping the WHERE to the caller makes another user's row unmatchable,
    // and not distinguishing "none matched" keeps the call idempotent.
    await prisma.deviceToken.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    event.node.res.statusCode = 204
    return null
  } catch (error) {
    ;(event.context.logger ?? logger).error({ err: error, route: 'DELETE /api/devices/:id' }, '[DELETE /api/devices/:id] Failed to unregister device token')
    throw createError({ statusCode: 500, statusMessage: 'Failed to unregister device token' })
  }
})
