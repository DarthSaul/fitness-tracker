defineRouteMeta({
  openAPI: {
    tags: ['Standalone Workout Sessions'],
    summary: 'Complete a standalone workout session',
    description: 'Marks a standalone workout session as completed. This never touches any program position — standalone sessions are fully isolated from program progress. Accepts an optional completedAt for backdating.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'StandaloneWorkoutSession CUID' },
    ],
    responses: {
      200: { description: 'Session marked completed' },
      400: { description: 'Missing session ID or invalid completedAt' },
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
    const body = await readBody(event)
    const hasExplicitDate = body !== undefined && body !== null && 'completedAt' in body
    let completedAtDate: Date | null

    if (!hasExplicitDate) {
      completedAtDate = new Date()
    } else if (body.completedAt === null) {
      completedAtDate = null
    } else {
      completedAtDate = new Date(body.completedAt)
      if (isNaN(completedAtDate.getTime())) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid completedAt date' })
      }
      if (completedAtDate.getTime() > Date.now()) {
        throw createError({ statusCode: 400, statusMessage: 'completedAt cannot be in the future' })
      }
    }

    const session = await prisma.standaloneWorkoutSession.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    })

    if (!session) {
      throw createError({ statusCode: 404, statusMessage: 'Session not found' })
    }

    if (session.userId !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }

    if (session.status === 'COMPLETED') {
      throw createError({ statusCode: 409, statusMessage: 'Session already completed' })
    }

    const updatedSession = await prisma.standaloneWorkoutSession.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: completedAtDate },
    })

    return { session: updatedSession }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'PATCH /api/standalone-workout-sessions/:id/complete' }, '[PATCH /api/standalone-workout-sessions/:id/complete] Failed to complete session')
    throw createError({ statusCode: 500, statusMessage: 'Failed to complete standalone workout session' })
  }
})
