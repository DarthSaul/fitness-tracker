defineRouteMeta({
  openAPI: {
    tags: ['Standalone Workout Sessions'],
    summary: 'Get a standalone workout session by ID',
    description: 'Returns a standalone workout session with its completed sets and the full workout template (groups → exercises → sets). Works for both in-progress and completed sessions.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'StandaloneWorkoutSession CUID' },
    ],
    responses: {
      200: { description: 'Session with completed sets and the workout template' },
      400: { description: 'Missing session ID' },
      401: { description: 'Unauthorized' },
      404: { description: 'Session not found' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const id = getRouterParam(event, 'id')

  if (!id?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing session ID' })
  }

  try {
    const session = await prisma.standaloneWorkoutSession.findUnique({
      where: { id },
      include: {
        completedSets: true,
        standaloneWorkout: {
          include: {
            groups: {
              orderBy: { order: 'asc' },
              include: {
                exercises: {
                  orderBy: { order: 'asc' },
                  include: {
                    exercise: { select: { id: true, name: true, description: true } },
                    sets: { orderBy: { setNumber: 'asc' } },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!session) {
      throw createError({ statusCode: 404, statusMessage: 'Session not found' })
    }

    if (session.userId !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }

    const { standaloneWorkout, ...sessionData } = session
    return { session: sessionData, workout: standaloneWorkout }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/standalone-workout-sessions/:id' }, '[GET /api/standalone-workout-sessions/:id] Failed to fetch session')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch standalone workout session' })
  }
})
