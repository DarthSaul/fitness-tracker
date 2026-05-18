defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Delete an extra set',
    description: 'Removes an extra (non-template) completed set from a workout session. Cannot delete template-set completions via this endpoint.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'WorkoutSession CUID' },
      { name: 'completedSetId', in: 'path', required: true, schema: { type: 'string' }, description: 'CompletedSet CUID' },
    ],
    responses: {
      200: { description: 'Extra set deleted' },
      400: { description: 'Missing IDs' },
      401: { description: 'Unauthorized' },
      404: { description: 'Session or set not found' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const id = getRouterParam(event, 'id')
  const completedSetId = getRouterParam(event, 'completedSetId')

  if (!id?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing session ID' })
  }
  if (!completedSetId?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing completed set ID' })
  }

  try {
    const session = await prisma.workoutSession.findUnique({
      where: { id },
    })

    if (!session || session.userId !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'Session not found' })
    }

    const completedSet = await prisma.completedSet.findFirst({
      where: { id: completedSetId, workoutSessionId: id, exerciseSetId: null },
    })

    if (!completedSet) {
      throw createError({ statusCode: 404, statusMessage: 'Extra set not found' })
    }

    await prisma.completedSet.delete({ where: { id: completedSetId } })

    return { deleted: true }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'DELETE /api/workouts/:id/extra-sets/:completedSetId' }, '[DELETE /api/workouts/:id/extra-sets/:completedSetId] Failed to delete extra set')
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete extra set' })
  }
})
