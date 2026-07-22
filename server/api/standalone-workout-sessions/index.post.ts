defineRouteMeta({
  openAPI: {
    tags: ['Standalone Workout Sessions'],
    summary: 'Start a standalone workout session',
    description: 'Starts an on-demand workout session for the given standalone workout. Has no effect on any program progress. At most one in-progress session is allowed per (user, workout).',
    responses: {
      201: { description: 'Standalone workout session started' },
      400: { description: 'Missing or invalid standaloneWorkoutId' },
      401: { description: 'Unauthorized' },
      404: { description: 'Standalone workout not found' },
      409: { description: 'A session is already in progress for this workout' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  try {
    const body = await readBody(event)
    const standaloneWorkoutId = body?.standaloneWorkoutId

    if (typeof standaloneWorkoutId !== 'string' || !standaloneWorkoutId.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'Missing standaloneWorkoutId' })
    }

    // Transaction guards against a TOCTOU race between the in-progress check and
    // insert; the partial unique index is the final backstop (P2002 -> 409).
    const session = await prisma.$transaction(async (tx) => {
      const workout = await tx.standaloneWorkout.findUnique({
        where: { id: standaloneWorkoutId },
      })

      if (!workout) {
        throw createError({ statusCode: 404, statusMessage: 'Standalone workout not found' })
      }

      const existing = await tx.standaloneWorkoutSession.findFirst({
        where: { userId, standaloneWorkoutId, status: 'IN_PROGRESS' },
      })

      if (existing) {
        throw createError({ statusCode: 409, statusMessage: 'A session is already in progress for this workout' })
      }

      return tx.standaloneWorkoutSession.create({
        data: { userId, standaloneWorkoutId, status: 'IN_PROGRESS' },
      })
    })

    event.node.res.statusCode = 201
    return { session }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    if ((error as { code?: string }).code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'A session is already in progress for this workout' })
    }
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/standalone-workout-sessions' }, '[POST /api/standalone-workout-sessions] Failed to start standalone workout session')
    throw createError({ statusCode: 500, statusMessage: 'Failed to start standalone workout session' })
  }
})
