defineRouteMeta({
  openAPI: {
    tags: ['Devices'],
    summary: 'Unregister device token',
    description: 'Soft-deletes a device token by setting revokedAt.',
    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
    responses: {
      204: { description: 'Device token unregistered' },
      403: { description: 'Forbidden' },
      404: { description: 'Device token not found' },
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
    const deviceToken = await prisma.deviceToken.findUnique({ where: { id } })

    if (!deviceToken) {
      throw createError({ statusCode: 404, statusMessage: 'Device token not found' })
    }
    if (deviceToken.userId !== userId) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    }

    await prisma.deviceToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    })

    event.node.res.statusCode = 204
    return null
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'DELETE /api/devices/:id' }, '[DELETE /api/devices/:id] Failed to unregister device token')
    throw createError({ statusCode: 500, statusMessage: 'Failed to unregister device token' })
  }
})
