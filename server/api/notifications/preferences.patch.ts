import type { NotificationType, Prisma } from '@prisma/client'

defineRouteMeta({
  openAPI: {
    tags: ['Notifications'],
    summary: 'Update my notification preferences',
    description:
      'Any subset of `{ push: { [type]: boolean }, timezone: string | null, workoutReminderTime: "HH:MM", '
      + 'workoutReminderDay: "sameDay" | "dayBefore" }`. One setting applies to every scheduled workout: '
      + '`dayBefore` + `"21:00"` reminds at 9 pm the night before. '
      + 'Returns the full settings, as `GET` does. iOS should send `timezone` (`TimeZone.current.identifier`) '
      + 'whenever it changes.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              push: { type: 'object', additionalProperties: { type: 'boolean' } },
              timezone: { type: 'string', nullable: true, example: 'America/Chicago' },
              workoutReminderTime: { type: 'string', example: '08:00' },
              workoutReminderDay: { type: 'string', enum: ['sameDay', 'dayBefore'] },
            },
          },
        },
      },
    },
    responses: {
      200: { description: '`{ push, timezone, workoutReminderTime, workoutReminderDay }`' },
      400: { description: 'Invalid field' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event): Promise<NotificationPreferences> => {
  const userId = event.context.userId as string
  const body = await readBody(event)
  const bad = (statusMessage: string) => createError({ statusCode: 400, statusMessage })

  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Body must be an object')

  const toggles: [NotificationType, boolean][] = []
  if (body.push !== undefined) {
    if (!body.push || typeof body.push !== 'object' || Array.isArray(body.push)) {
      throw bad('push must be an object of type → boolean')
    }
    for (const [type, enabled] of Object.entries(body.push)) {
      if (!(NOTIFICATION_TYPES as string[]).includes(type)) throw bad(`Unknown notification type: ${type}`)
      if (typeof enabled !== 'boolean') throw bad(`push.${type} must be a boolean`)
      toggles.push([type as NotificationType, enabled])
    }
  }

  const userData: Prisma.UserUpdateInput = {}
  if (body.timezone !== undefined) {
    if (body.timezone !== null && !isValidTimeZone(body.timezone)) throw bad('timezone must be an IANA time zone or null')
    userData.timezone = body.timezone
  }
  if (body.workoutReminderTime !== undefined) {
    const minute = parseReminderTime(body.workoutReminderTime)
    if (minute === null) throw bad('workoutReminderTime must be HH:MM (24-hour)')
    userData.workoutReminderMinute = minute
  }
  if (body.workoutReminderDay !== undefined) {
    const day = parseReminderDay(body.workoutReminderDay)
    if (day === null) throw bad('workoutReminderDay must be sameDay or dayBefore')
    userData.workoutReminderDay = day
  }

  if (toggles.length === 0 && Object.keys(userData).length === 0) throw bad('Nothing to update')

  try {
    await prisma.$transaction([
      ...toggles.map(([type, pushEnabled]) => prisma.notificationPreference.upsert({
        where: { userId_type: { userId, type } },
        create: { userId, type, pushEnabled },
        update: { pushEnabled },
      })),
      ...(Object.keys(userData).length > 0
        ? [prisma.user.update({ where: { id: userId }, data: userData, select: { id: true } })]
        : []),
    ])
    return await loadNotificationPreferences(userId)
  } catch (error) {
    ;(event.context.logger ?? logger).error({ err: error, route: 'PATCH /api/notifications/preferences' }, '[PATCH /api/notifications/preferences] Failed to update notification preferences')
    throw createError({ statusCode: 500, statusMessage: 'Failed to update notification preferences' })
  }
})
