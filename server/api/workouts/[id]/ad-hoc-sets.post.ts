defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Add an ad-hoc exercise set',
    description: 'Creates a blank completed set for a user-defined exercise not in the program. Used for the "Add Exercise Group" feature during a workout.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'WorkoutSession CUID' },
    ],
    responses: {
      201: { description: 'Ad-hoc set created' },
      400: { description: 'Missing or invalid fields' },
      401: { description: 'Unauthorized' },
      404: { description: 'Session not found' },
      409: { description: 'Session is not in progress' },
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
    const body = await readBody(event)
    const { exerciseName } = body || {}

    if (!exerciseName || typeof exerciseName !== 'string' || !exerciseName.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'exerciseName is required' })
    }

    if (exerciseName.length > 200) {
      throw createError({ statusCode: 400, statusMessage: 'exerciseName must be 200 characters or less' })
    }

    const session = await prisma.workoutSession.findUnique({ where: { id } })

    if (!session || session.userId !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'Session not found' })
    }

    if (session.status !== 'IN_PROGRESS') {
      throw createError({ statusCode: 409, statusMessage: 'Session is not in progress' })
    }

    const completedSet = await prisma.completedSet.create({
      data: {
        workoutSessionId: id,
        exerciseSetId: null,
        programExerciseId: null,
        adhocExerciseName: exerciseName.trim(),
        reps: null,
        weight: null,
      },
    })

    event.node.res.statusCode = 201
    return completedSet
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/workouts/:id/ad-hoc-sets' }, '[POST /api/workouts/:id/ad-hoc-sets] Failed to create ad-hoc set')
    throw createError({ statusCode: 500, statusMessage: 'Failed to create ad-hoc set' })
  }
})
