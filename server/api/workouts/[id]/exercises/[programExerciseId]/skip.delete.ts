defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Un-skip an exercise in a workout session',
    description: 'Removes the skip record so the exercise reappears in session reads. Completed sets deleted when the exercise was skipped are not restored.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'WorkoutSession CUID' },
      { name: 'programExerciseId', in: 'path', required: true, schema: { type: 'string' }, description: 'ProgramExercise CUID' },
    ],
    responses: {
      200: { description: 'Skip removed' },
      400: { description: 'Missing IDs' },
      401: { description: 'Unauthorized' },
      404: { description: 'Session not found or exercise is not skipped' },
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
    const session = await prisma.workoutSession.findUnique({
      where: { id },
    })

    if (!session || session.userId !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'Session not found' })
    }

    if (session.status !== 'IN_PROGRESS') {
      throw createError({ statusCode: 409, statusMessage: 'Session is not in progress' })
    }

    // deleteMany + count check avoids a find/delete TOCTOU without a transaction
    const { count } = await prisma.workoutExerciseSkip.deleteMany({
      where: { workoutSessionId: id, programExerciseId },
    })

    if (count === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Exercise is not skipped' })
    }

    return { deleted: true }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'DELETE /api/workouts/:id/exercises/:programExerciseId/skip' }, '[DELETE /api/workouts/:id/exercises/:programExerciseId/skip] Failed to remove exercise skip')
    throw createError({ statusCode: 500, statusMessage: 'Failed to remove exercise skip' })
  }
})
