defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Swap an exercise in a workout session',
    description: 'Replaces an exercise with an alternative for the current session. Clears all completed sets (template and extra) for the original exercise and upserts the swap record.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'WorkoutSession CUID' },
      { name: 'programExerciseId', in: 'path', required: true, schema: { type: 'string' }, description: 'ProgramExercise CUID' },
    ],
    responses: {
      200: { description: 'Swap recorded with count of deleted sets' },
      400: { description: 'Missing or invalid fields' },
      401: { description: 'Unauthorized' },
      404: { description: 'Session, exercise, or replacement not found' },
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
    const { replacementExerciseId } = body || {}

    if (typeof replacementExerciseId !== 'string' || !replacementExerciseId.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'replacementExerciseId must be a non-empty string' })
    }

    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.workoutSession.findUnique({
        where: { id },
        include: { userProgram: true },
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
        include: { exercise: true, sets: true },
      })

      if (!programExercise) {
        throw createError({ statusCode: 400, statusMessage: 'programExerciseId does not belong to this session\'s day' })
      }

      const replacement = await tx.exercise.findUnique({
        where: { id: replacementExerciseId },
        select: { id: true },
      })

      if (!replacement) {
        throw createError({ statusCode: 404, statusMessage: 'Replacement exercise not found' })
      }

      const existingSwap = await tx.workoutExerciseSwap.findFirst({
        where: { workoutSessionId: id, programExerciseId },
      })
      const effectiveCurrentExerciseId = existingSwap?.replacementExerciseId ?? programExercise.exerciseId

      if (replacementExerciseId === effectiveCurrentExerciseId) {
        throw createError({ statusCode: 400, statusMessage: 'Replacement exercise is the same as the current exercise' })
      }

      const originalExerciseId = programExercise.exerciseId

      // Delete all template CompletedSets for this session + programExercise
      const exerciseSetIds = programExercise.sets.map((s: { id: string }) => s.id)
      const deleted1 = await tx.completedSet.deleteMany({
        where: { workoutSessionId: id, exerciseSetId: { in: exerciseSetIds } },
      })

      // Delete all extra CompletedSets for this session + programExercise
      const deleted2 = await tx.completedSet.deleteMany({
        where: { workoutSessionId: id, exerciseSetId: null, programExerciseId },
      })

      const swap = await tx.workoutExerciseSwap.upsert({
        where: { workoutSessionId_programExerciseId: { workoutSessionId: id, programExerciseId } },
        create: { workoutSessionId: id, programExerciseId, originalExerciseId, replacementExerciseId },
        update: { replacementExerciseId },
      })

      return { swap, deletedSetCount: deleted1.count + deleted2.count }
    })

    return result
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/workouts/:id/exercises/:programExerciseId/swap' }, '[POST /api/workouts/:id/exercises/:programExerciseId/swap] Failed to swap exercise')
    throw createError({ statusCode: 500, statusMessage: 'Failed to swap exercise' })
  }
})
