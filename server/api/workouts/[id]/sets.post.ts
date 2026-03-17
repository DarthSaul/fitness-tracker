defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Record a completed set',
    description: 'Records a completed set within an active workout session. Validates that the exercise set belongs to the current workout day.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'WorkoutSession CUID' },
    ],
    responses: {
      201: { description: 'Completed set recorded' },
      400: { description: 'Missing or invalid fields' },
      403: { description: 'Session belongs to another user' },
      404: { description: 'Session not found' },
      409: { description: 'Session already completed' },
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

  const body = await readBody(event)
  const { exerciseSetId, reps, weight, rpe, notes } = body || {}

  if (!exerciseSetId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing exerciseSetId' })
  }

  try {
    const session = await prisma.workoutSession.findUnique({
      where: { id },
      include: { userProgram: true },
    })

    if (!session) {
      throw createError({ statusCode: 404, statusMessage: 'Session not found' })
    }

    if (session.userId !== userId) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    }

    if (session.status === 'COMPLETED') {
      throw createError({ statusCode: 409, statusMessage: 'Session already completed' })
    }

    // Validate that the exerciseSet belongs to this workout's day
    const exerciseSet = await prisma.exerciseSet.findUnique({
      where: { id: exerciseSetId },
      include: {
        programExercise: {
          include: {
            exerciseGroup: {
              include: {
                programDay: {
                  include: {
                    programWeek: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!exerciseSet) {
      throw createError({ statusCode: 400, statusMessage: 'Exercise set not found' })
    }

    const programWeek = exerciseSet.programExercise.exerciseGroup.programDay.programWeek
    if (
      programWeek.weekNumber !== session.weekNumber ||
      exerciseSet.programExercise.exerciseGroup.programDay.dayNumber !== session.dayNumber ||
      programWeek.programId !== session.userProgram.programId
    ) {
      throw createError({ statusCode: 400, statusMessage: 'Exercise set does not belong to this workout day' })
    }

    const completedSet = await prisma.completedSet.create({
      data: {
        workoutSessionId: id,
        exerciseSetId,
        reps,
        weight,
        rpe,
        notes,
      },
    })

    event.node.res.statusCode = 201
    return completedSet
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[POST /api/workouts/:id/sets] Failed to record completed set', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to record completed set' })
  }
})
