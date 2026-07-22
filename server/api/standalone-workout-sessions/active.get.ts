defineRouteMeta({
  openAPI: {
    tags: ['Standalone Workout Sessions'],
    summary: 'List in-progress standalone workout sessions',
    description: 'Returns the authenticated user\'s in-progress standalone workout sessions, each with its workout summary and completed-set count.',
    responses: {
      200: { description: 'Array of in-progress standalone sessions' },
      401: { description: 'Unauthorized' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  try {
    const sessions = await prisma.standaloneWorkoutSession.findMany({
      where: { userId, status: 'IN_PROGRESS' },
      orderBy: { startedAt: 'desc' },
      include: {
        _count: { select: { completedSets: true } },
        standaloneWorkout: {
          select: { id: true, category: true, order: true, name: true },
        },
      },
    })

    return { sessions }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/standalone-workout-sessions/active' }, '[GET /api/standalone-workout-sessions/active] Failed to fetch active sessions')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch active standalone sessions' })
  }
})
