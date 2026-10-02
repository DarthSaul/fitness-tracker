defineRouteMeta({
  openAPI: {
    tags: ['Notifications'],
    summary: 'Mark all my notifications read',
    description:
      'Marks every unread notification created at or before `before` as read (default: now). Pass the `createdAt` of the '
      + 'newest notification on screen, so one that arrives while the user taps is not marked read unseen.',
    requestBody: {
      required: false,
      content: { 'application/json': { schema: { type: 'object', properties: { before: { type: 'string', format: 'date-time' } } } } },
    },
    responses: {
      200: { description: '`{ count }` — how many were marked read' },
      400: { description: 'Invalid before timestamp' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event): Promise<{ count: number }> => {
  const userId = event.context.userId as string
  const body = await readBody(event)

  let before = new Date()
  if (body?.before !== undefined) {
    const parsed = typeof body.before === 'string' ? new Date(body.before) : new Date(Number.NaN)
    if (Number.isNaN(parsed.getTime())) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid before timestamp' })
    }
    before = parsed
  }

  try {
    const { count } = await prisma.notification.updateMany({
      where: { recipientId: userId, readAt: null, createdAt: { lte: before } },
      data: { readAt: new Date() },
    })
    return { count }
  } catch (error) {
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/notifications/read-all' }, '[POST /api/notifications/read-all] Failed to mark notifications read')
    throw createError({ statusCode: 500, statusMessage: 'Failed to mark notifications read' })
  }
})
