defineRouteMeta({
  openAPI: {
    tags: ['Standalone Workout Sessions'],
    summary: 'Delete a completed set in a standalone session',
    description: 'Removes a completed set record (prescribed or ad-hoc) from a standalone workout session. Works on both in-progress and completed sessions, matching program workout sessions.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'StandaloneWorkoutSession CUID' },
      { name: 'setId', in: 'path', required: true, schema: { type: 'string' }, description: 'StandaloneCompletedSet CUID' },
    ],
    responses: {
      200: { description: 'Set deleted' },
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
  const setId = getRouterParam(event, 'setId')

  if (!id?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing session ID' })
  }

  if (!setId?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing set ID' })
  }

  try {
    const session = await prisma.standaloneWorkoutSession.findUnique({
      where: { id },
    })

    if (!session) {
      throw createError({ statusCode: 404, statusMessage: 'Session not found' })
    }

    if (session.userId !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }

    const completedSet = await prisma.standaloneCompletedSet.findFirst({
      where: { id: setId, standaloneWorkoutSessionId: id },
    })

    if (!completedSet) {
      throw createError({ statusCode: 404, statusMessage: 'Completed set not found' })
    }

    await prisma.standaloneCompletedSet.delete({ where: { id: setId } })

    return { deleted: true }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    // Concurrent delete (e.g. a client retry) removes the row between the
    // scoped lookup and delete -> Prisma P2025. Treat as already-gone.
    if ((error as { code?: string }).code === 'P2025') {
      throw createError({ statusCode: 404, statusMessage: 'Completed set not found' })
    }
    ;(event.context.logger ?? logger).error({ err: error, route: 'DELETE /api/standalone-workout-sessions/:id/sets/:setId' }, '[DELETE /api/standalone-workout-sessions/:id/sets/:setId] Failed to delete completed set')
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete completed set' })
  }
})
