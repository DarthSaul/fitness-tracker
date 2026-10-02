defineRouteMeta({
  openAPI: {
    tags: ['Notifications'],
    summary: 'Count my unread notifications',
    description: 'The badge number: unread, non-dismissed notifications. The same value is sent as the APNs `badge`.',
    responses: {
      200: { description: '`{ count }`' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event): Promise<{ count: number }> => {
  const userId = event.context.userId as string
  try {
    return { count: await unreadCount(userId) }
  } catch (error) {
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/notifications/unread-count' }, '[GET /api/notifications/unread-count] Failed to count notifications')
    throw createError({ statusCode: 500, statusMessage: 'Failed to count notifications' })
  }
})
