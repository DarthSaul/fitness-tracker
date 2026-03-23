defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Abandon a workout session',
    description: 'Deletes an in-progress workout session and all its completed sets. Does not change the user\'s program position.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'WorkoutSession CUID' },
    ],
    responses: {
      200: { description: 'Session deleted' },
      400: { description: 'Missing session ID' },
      401: { description: 'Unauthorized' },

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

  try {
    const session = await prisma.workoutSession.findUnique({
      where: { id },
    })

    if (!session) {
      throw createError({ statusCode: 404, statusMessage: 'Session not found' })
    }

    if (session.userId !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }

    if (session.status === 'COMPLETED') {
      throw createError({ statusCode: 409, statusMessage: 'Cannot delete a completed session' })
    }

    // Cascade delete handles CompletedSets
    await prisma.workoutSession.delete({ where: { id } })

    return { deleted: true }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[DELETE /api/workouts/:id] Failed to delete workout session', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete workout session' })
  }
})
