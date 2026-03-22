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
      401: { description: 'Unauthorized' },
      403: { description: 'Session belongs to another user' },
      404: { description: 'Session not found' },
      409: { description: 'Session already completed or duplicate set submission' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const id = getRouterParam(event, 'id')

  if (!id?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing session ID' })
  }

  try {
    const body = await readBody(event)
    const { exerciseSetId, reps, weight, rpe, notes } = body || {}

    if (typeof exerciseSetId !== 'string' || !exerciseSetId.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'Missing exerciseSetId' })
    }

    // Validate numeric fields when present
    if (reps !== undefined && reps !== null && (!Number.isFinite(reps) || reps < 0)) {
      throw createError({ statusCode: 400, statusMessage: 'reps must be a non-negative number' })
    }
    if (weight !== undefined && weight !== null && (!Number.isFinite(weight) || weight < 0)) {
      throw createError({ statusCode: 400, statusMessage: 'weight must be a non-negative number' })
    }
    if (rpe !== undefined && rpe !== null && (!Number.isFinite(rpe) || rpe < 0 || rpe > 10)) {
      throw createError({ statusCode: 400, statusMessage: 'rpe must be between 0 and 10' })
    }
    if (notes !== undefined && notes !== null && (typeof notes !== 'string' || notes.length > 500)) {
      throw createError({ statusCode: 400, statusMessage: 'notes must be a string of 500 characters or less' })
    }
    // Wrap in transaction to prevent TOCTOU race between status check and insert
    const completedSet = await prisma.$transaction(async (tx) => {
      const session = await tx.workoutSession.findUnique({
        where: { id },
        include: { userProgram: true },
      })

      if (!session) {
        throw createError({ statusCode: 404, statusMessage: 'Session not found' })
      }

      if (session.userId !== userId) {
        throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
      }

      // Validate that the exerciseSet belongs to this workout's day
      const exerciseSet = await tx.exerciseSet.findUnique({
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
        throw createError({ statusCode: 404, statusMessage: 'Exercise set not found' })
      }

      const programWeek = exerciseSet.programExercise.exerciseGroup.programDay.programWeek
      if (
        programWeek.weekNumber !== session.weekNumber ||
        exerciseSet.programExercise.exerciseGroup.programDay.dayNumber !== session.dayNumber ||
        programWeek.programId !== session.userProgram.programId
      ) {
        throw createError({ statusCode: 400, statusMessage: 'Exercise set does not belong to this workout day' })
      }

      return tx.completedSet.create({
        data: {
          workoutSessionId: id,
          exerciseSetId,
          reps,
          weight,
          rpe,
          notes,
        },
      })
    })

    event.node.res.statusCode = 201
    return completedSet
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    if ((error as { code?: string }).code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Set already recorded for this session' })
    }
    console.error('[POST /api/workouts/:id/sets] Failed to record completed set', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to record completed set' })
  }
})
