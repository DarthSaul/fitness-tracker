defineRouteMeta({
  openAPI: {
    tags: ['Notifications'],
    summary: 'List my notifications',
    description:
      'The caller\'s inbox, newest first, excluding dismissed notifications. `status=unread` limits it to unread ones. '
      + 'Each item carries a derived `status` (`unread` | `read`), the `actor` (null for system notifications), '
      + 'deep-link ids in `target`, and a render snapshot in `data`. Paginated like `GET /api/history`: '
      + '`before` + `beforeId` from the last item, `limit` 1–50 (default 20).',
    parameters: [
      { name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['unread', 'all'], default: 'all' } },
      { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
      { name: 'before', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
      { name: 'beforeId', in: 'query', required: false, schema: { type: 'string' } },
    ],
    responses: {
      200: { description: '`{ notifications }`' },
      400: { description: 'Invalid status, limit or cursor' },
      500: { description: 'Internal server error' },
    },
  },
})

const STATUSES = ['unread', 'all'] as const

export default defineEventHandler(async (event): Promise<{ notifications: NotificationPayload[] }> => {
  const userId = event.context.userId as string
  const query = getQuery(event)

  const status = query.status ?? 'all'
  if (typeof status !== 'string' || !(STATUSES as readonly string[]).includes(status)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid status' })
  }
  const page = parsePageQuery(query)

  try {
    const inbox = inboxWhere(userId, await blockedUserIds(userId))
    const rows = await prisma.notification.findMany({
      where: { AND: [status === 'unread' ? { ...inbox, readAt: null } : inbox, pageWhere(page.before)] },
      orderBy: newestFirst,
      take: page.limit,
      select: notificationSelect,
    })
    return { notifications: rows.map(toNotificationPayload) }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/notifications' }, '[GET /api/notifications] Failed to fetch notifications')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch notifications' })
  }
})
