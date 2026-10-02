defineRouteMeta({
  openAPI: {
    tags: ['Notifications'],
    summary: 'Get my notification preferences',
    description:
      '`push` maps every notification type to whether it is pushed (default true; the inbox always records it). '
      + '`timezone` (IANA, null until the client sends one) and `workoutReminderTime` (local `HH:MM`, default `08:00`) '
      + 'decide when scheduled-workout reminders fire. With no timezone, none fire.',
    responses: {
      200: { description: '`{ push, timezone, workoutReminderTime }`' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event): Promise<NotificationPreferences> => {
  const userId = event.context.userId as string
  try {
    return await loadNotificationPreferences(userId)
  } catch (error) {
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/notifications/preferences' }, '[GET /api/notifications/preferences] Failed to fetch notification preferences')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch notification preferences' })
  }
})
