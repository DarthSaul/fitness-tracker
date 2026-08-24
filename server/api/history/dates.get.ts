defineRouteMeta({
  openAPI: {
    tags: ['History'],
    summary: 'Completion timestamps for the calendar',
    description: 'Returns the completedAt timestamps of every COMPLETED session — program and standalone — as ISO strings sorted ascending. Clients convert each instant to a local calendar day to mark completed days on the calendar; returning raw instants (rather than server-computed dates) keeps the day boundary correct across timezones and DST.',
    responses: {
      200: { description: 'List of completion timestamps' },
      401: { description: 'Unauthorized' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  // Defence in depth: Prisma drops undefined `where` keys, so an unset userId
  // would return every user's sessions. Fail closed instead.
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  try {
    const where = { userId, status: 'COMPLETED' as const, completedAt: { not: null } }
    const select = { completedAt: true }

    const [programSessions, standaloneSessions] = await Promise.all([
      prisma.workoutSession.findMany({ where, select }),
      prisma.standaloneWorkoutSession.findMany({ where, select }),
    ])

    const completedAt = [...programSessions, ...standaloneSessions]
      .map((s) => s.completedAt)
      .filter((d): d is Date => d != null)
      .sort((a, b) => a.getTime() - b.getTime())
      .map((d) => d.toISOString())

    return { completedAt }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/history/dates' }, '[GET /api/history/dates] Failed to fetch workout dates')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch workout dates' })
  }
})
