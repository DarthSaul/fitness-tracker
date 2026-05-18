defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Add an extra set for an exercise',
    description: 'Records an additional (non-template) set for an exercise within an active workout session.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'WorkoutSession CUID' },
      { name: 'programExerciseId', in: 'path', required: true, schema: { type: 'string' }, description: 'ProgramExercise CUID' },
    ],
    responses: {
      201: { description: 'Extra set recorded' },
      400: { description: 'Missing or invalid fields' },
      401: { description: 'Unauthorized' },
      404: { description: 'Session or exercise not found' },
      409: { description: 'Session is not in progress' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const id = getRouterParam(event, 'id')
  const programExerciseId = getRouterParam(event, 'programExerciseId')

  if (!id?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing session ID' })
  }
  if (!programExerciseId?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing programExerciseId' })
  }

  try {
    const body = await readBody(event)
    const { reps, weight, rpe, notes } = body || {}

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

    const completedSet = await prisma.$transaction(async (tx) => {
      const session = await tx.workoutSession.findUnique({
        where: { id },
        include: { userProgram: { include: { program: true } } },
      })

      if (!session || session.userId !== userId) {
        throw createError({ statusCode: 404, statusMessage: 'Session not found' })
      }

      if (session.status !== 'IN_PROGRESS') {
        throw createError({ statusCode: 409, statusMessage: 'Session is not in progress' })
      }

      const programExercise = await tx.programExercise.findFirst({
        where: {
          id: programExerciseId,
          exerciseGroup: {
            programDay: {
              dayNumber: session.dayNumber,
              programWeek: {
                weekNumber: session.weekNumber,
                programId: session.userProgram.programId,
              },
            },
          },
        },
      })

      if (!programExercise) {
        throw createError({ statusCode: 400, statusMessage: 'programExerciseId does not belong to this session\'s day' })
      }

      return tx.completedSet.create({
        data: {
          workoutSessionId: id,
          exerciseSetId: null,
          programExerciseId,
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
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/workouts/:id/exercises/:programExerciseId/extra-sets' }, '[POST /api/workouts/:id/exercises/:programExerciseId/extra-sets] Failed to record extra set')
    throw createError({ statusCode: 500, statusMessage: 'Failed to record extra set' })
  }
})
