defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Skip an exercise in a workout session',
    description: 'Removes an exercise from the current session: deletes all its completed sets (template and extra) and records a skip so the exercise no longer appears in session reads. Skipping one exercise of a superset group leaves the other exercises untouched. An existing swap for the slot is preserved and re-applies on un-skip.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'WorkoutSession CUID' },
      { name: 'programExerciseId', in: 'path', required: true, schema: { type: 'string' }, description: 'ProgramExercise CUID' },
    ],
    responses: {
      201: { description: 'Skip recorded with count of deleted sets' },
      400: { description: 'Missing or invalid fields' },
      401: { description: 'Unauthorized' },
      404: { description: 'Session not found' },
      409: { description: 'Session is not in progress or exercise already skipped' },
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
        include: { sets: true },
      })

      if (!programExercise) {
        throw createError({ statusCode: 400, statusMessage: 'programExerciseId does not belong to this session\'s day' })
      }

      const existingSkip = await tx.workoutExerciseSkip.findUnique({
        where: { workoutSessionId_programExerciseId: { workoutSessionId: id, programExerciseId } },
      })

      if (existingSkip) {
        throw createError({ statusCode: 409, statusMessage: 'Exercise already skipped' })
      }

      // Delete all template CompletedSets for this session + programExercise
      const exerciseSetIds = programExercise.sets.map((s: { id: string }) => s.id)
      const deleted1 = await tx.completedSet.deleteMany({
        where: { workoutSessionId: id, exerciseSetId: { in: exerciseSetIds } },
      })

      // Delete all extra CompletedSets for this session + programExercise
      const deleted2 = await tx.completedSet.deleteMany({
        where: { workoutSessionId: id, exerciseSetId: null, programExerciseId },
      })

      const skip = await tx.workoutExerciseSkip.create({
        data: { workoutSessionId: id, programExerciseId },
      })

      return { skip, deletedSetCount: deleted1.count + deleted2.count }
    })

    event.node.res.statusCode = 201
    return result
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    if ((error as { code?: string }).code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Exercise already skipped' })
    }
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/workouts/:id/exercises/:programExerciseId/skip' }, '[POST /api/workouts/:id/exercises/:programExerciseId/skip] Failed to skip exercise')
    throw createError({ statusCode: 500, statusMessage: 'Failed to skip exercise' })
  }
})
