defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Delete a completed set',
    description: 'Removes a completed set record from a workout session. Works on both in-progress and completed sessions.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'WorkoutSession CUID' },
      { name: 'setId', in: 'path', required: true, schema: { type: 'string' }, description: 'CompletedSet CUID' },
    ],
    responses: {
      200: { description: 'Set deleted' },
      400: { description: 'Missing IDs' },
      401: { description: 'Unauthorized' },
      403: { description: 'Session belongs to another user' },
      404: { description: 'Session or set not found' },
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
  const setId = getRouterParam(event, 'setId')

  if (!id?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing session ID' })
  }

  if (!setId?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing set ID' })
  }

  try {
    const session = await prisma.workoutSession.findUnique({
      where: { id },
    })

    if (!session) {
      throw createError({ statusCode: 404, statusMessage: 'Session not found' })
    }

    if (session.userId !== userId) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    }

    const completedSet = await prisma.completedSet.findFirst({
      where: { id: setId, workoutSessionId: id },
    })

    if (!completedSet) {
      throw createError({ statusCode: 404, statusMessage: 'Completed set not found' })
    }

    await prisma.completedSet.delete({ where: { id: setId } })

    return { deleted: true }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[DELETE /api/workouts/:id/sets/:setId] Failed to delete completed set', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete completed set' })
  }
})
