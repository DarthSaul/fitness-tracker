defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Delete a core set',
    description: 'Removes a logged core set from a workout session. Works on any session status to support the editing flow.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'WorkoutSession CUID' },
      { name: 'coreSetId', in: 'path', required: true, schema: { type: 'string' }, description: 'CompletedCoreSet CUID' },
    ],
    responses: {
      200: { description: 'Core set deleted' },
      400: { description: 'Missing IDs' },
      401: { description: 'Unauthorized' },
      404: { description: 'Session or core set not found' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const id = getRouterParam(event, 'id')
  const coreSetId = getRouterParam(event, 'coreSetId')

  if (!id?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing session ID' })
  }
  if (!coreSetId?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing core set ID' })
  }

  try {
    const session = await prisma.workoutSession.findUnique({ where: { id } })

    if (!session) {
      throw createError({ statusCode: 404, statusMessage: 'Session not found' })
    }

    if (session.userId !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }

    const coreSet = await prisma.completedCoreSet.findFirst({
      where: { id: coreSetId, workoutSessionId: id },
    })

    if (!coreSet) {
      throw createError({ statusCode: 404, statusMessage: 'Core set not found' })
    }

    await prisma.completedCoreSet.delete({ where: { id: coreSetId } })

    return { deleted: true }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    // Row deleted by a concurrent request between the lookup and the delete
    if ((error as { code?: string }).code === 'P2025') {
      throw createError({ statusCode: 404, statusMessage: 'Core set not found' })
    }
    ;(event.context.logger ?? logger).error({ err: error, route: 'DELETE /api/workouts/:id/core-sets/:coreSetId' }, '[DELETE /api/workouts/:id/core-sets/:coreSetId] Failed to delete core set')
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete core set' })
  }
})
