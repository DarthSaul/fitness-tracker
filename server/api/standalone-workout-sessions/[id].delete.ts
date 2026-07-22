defineRouteMeta({
  openAPI: {
    tags: ['Standalone Workout Sessions'],
    summary: 'Delete (abandon) a standalone workout session',
    description: 'Deletes the user\'s standalone workout session and its completed sets. Typically used to abandon an in-progress session.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'StandaloneWorkoutSession CUID' },
    ],
    responses: {
      200: { description: 'Session deleted' },
      400: { description: 'Missing session ID' },
      401: { description: 'Unauthorized' },
      404: { description: 'Session not found' },
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
    const session = await prisma.standaloneWorkoutSession.findUnique({
      where: { id },
      select: { id: true, userId: true },
    })

    if (!session) {
      throw createError({ statusCode: 404, statusMessage: 'Session not found' })
    }

    if (session.userId !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }

    await prisma.standaloneWorkoutSession.delete({ where: { id } })

    return { success: true }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    // Concurrent delete (e.g. a client retry) removes the row between the
    // ownership check and delete -> Prisma P2025. Treat as already-gone.
    if ((error as { code?: string }).code === 'P2025') {
      throw createError({ statusCode: 404, statusMessage: 'Session not found' })
    }
    ;(event.context.logger ?? logger).error({ err: error, route: 'DELETE /api/standalone-workout-sessions/:id' }, '[DELETE /api/standalone-workout-sessions/:id] Failed to delete session')
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete standalone workout session' })
  }
})
