defineRouteMeta({
  openAPI: {
    tags: ['Notifications'],
    summary: 'Mark a notification read, unread or dismissed',
    description:
      '`read` stamps `readAt` (keeping the first one) and restores a dismissed notification. `unread` clears both. '
      + '`dismissed` hides it from the inbox and also marks it read. Only the recipient may change it; anything else is 404.',
    requestBody: {
      content: {
        'application/json': {
          schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['read', 'unread', 'dismissed'] } } },
        },
      },
    },
    responses: {
      200: { description: '`{ notification }`' },
      400: { description: 'Missing id or invalid status' },
      404: { description: 'Notification not found' },
      500: { description: 'Internal server error' },
    },
  },
})

const STATUSES = ['read', 'unread', 'dismissed'] as const
type Target = (typeof STATUSES)[number]

export default defineEventHandler(async (event): Promise<{ notification: NotificationPayload }> => {
  const userId = event.context.userId as string
  const id = getRouterParam(event, 'id')?.trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing notification id' })
  }

  const body = await readBody(event)
  const status = body?.status
  if (typeof status !== 'string' || !(STATUSES as readonly string[]).includes(status)) {
    throw createError({ statusCode: 400, statusMessage: 'status must be read, unread or dismissed' })
  }

  try {
    const existing = await prisma.notification.findFirst({ where: { id, recipientId: userId }, select: { readAt: true } })
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'Notification not found' })
    }

    const now = new Date()
    const data: Record<Target, { readAt: Date | null; dismissedAt: Date | null }> = {
      read: { readAt: existing.readAt ?? now, dismissedAt: null },
      unread: { readAt: null, dismissedAt: null },
      dismissed: { readAt: existing.readAt ?? now, dismissedAt: now },
    }
    const row = await prisma.notification.update({ where: { id }, data: data[status as Target], select: notificationSelect })
    return { notification: toNotificationPayload(row) }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'PATCH /api/notifications/:id' }, '[PATCH /api/notifications/:id] Failed to update notification')
    throw createError({ statusCode: 500, statusMessage: 'Failed to update notification' })
  }
})
