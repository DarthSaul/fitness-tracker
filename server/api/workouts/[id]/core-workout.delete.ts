defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Delete the core workout for a session',
    description: 'Removes the session\'s core circuit plan and its ordered exercises. Works on any session status to support the editing flow.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'WorkoutSession CUID' },
    ],
    responses: {
      200: { description: 'Core workout deleted' },
      400: { description: 'Missing session ID' },
      401: { description: 'Unauthorized' },
      404: { description: 'Session or core workout not found' },
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
    const session = await prisma.workoutSession.findUnique({ where: { id } })

    if (!session) {
      throw createError({ statusCode: 404, statusMessage: 'Session not found' })
    }

    if (session.userId !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }

    const coreWorkout = await prisma.coreWorkout.findUnique({
      where: { workoutSessionId: id },
    })

    if (!coreWorkout) {
      throw createError({ statusCode: 404, statusMessage: 'Core workout not found' })
    }

    await prisma.coreWorkout.delete({ where: { id: coreWorkout.id } })

    return { deleted: true }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    // Row deleted by a concurrent request between the lookup and the delete
    if ((error as { code?: string }).code === 'P2025') {
      throw createError({ statusCode: 404, statusMessage: 'Core workout not found' })
    }
    ;(event.context.logger ?? logger).error({ err: error, route: 'DELETE /api/workouts/:id/core-workout' }, '[DELETE /api/workouts/:id/core-workout] Failed to delete core workout')
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete core workout' })
  }
})
