// Not under /api/auth/: that prefix is public in server/middleware/auth.ts,
// where only the exact /api/auth/me is carved back out.
defineRouteMeta({
  openAPI: {
    tags: ['Analytics'],
    summary: 'Weekly workout goal progress',
    description:
      'The caller\'s weekly workout goal and how many workouts they have completed this week '
      + '(docs/weekly-goal/SPEC-weekly-goal.md). The week runs from local 00:00 on `weekStartDay` (a setting on '
      + 'PATCH /api/auth/me, default SUNDAY) for seven local days, in the `timeZone` param, else the stored '
      + '`User.timezone`, else UTC. The count is completed program and standalone sessions whose `completedAt` '
      + 'falls in `[weekStart, weekEnd)`, returned even when the goal is disabled. Private to the caller.',
    parameters: [
      { name: 'timeZone', in: 'query', required: false, schema: { type: 'string', example: 'America/Chicago' }, description: 'IANA zone; iOS sends TimeZone.current.identifier' },
    ],
    responses: {
      200: { description: '`{ enabled, goal, completedThisWeek, weekStartDay, weekStart, weekEnd, timeZone }`; weekStart/weekEnd are ISO instants, weekEnd exclusive' },
      400: { description: 'timeZone is not an IANA zone' },
      401: { description: 'Unauthorized' },
      404: { description: 'User not found' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  try {
    const timeZoneParam = parseTimeZoneParam(getQuery(event).timeZone)

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { weeklyWorkoutGoalEnabled: true, weeklyWorkoutGoal: true, weekStartDay: true, timezone: true },
    })
    if (!user) {
      throw createError({ statusCode: 404, statusMessage: 'User not found' })
    }

    const timeZone = timeZoneParam ?? (isValidTimeZone(user.timezone) ? user.timezone : 'UTC')
    const { start, end } = weekBounds(new Date(), user.weekStartDay, timeZone)

    return {
      enabled: user.weeklyWorkoutGoalEnabled,
      goal: user.weeklyWorkoutGoal,
      completedThisWeek: await completedWorkoutsBetween(userId, start, end),
      weekStartDay: user.weekStartDay,
      weekStart: start.toISOString(),
      weekEnd: end.toISOString(),
      timeZone,
    }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/weekly-goal' }, '[GET /api/weekly-goal] Failed to fetch weekly goal')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch weekly goal' })
  }
})
