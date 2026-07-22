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
    // `in` requires an object operand — guard against primitive JSON bodies so
    // malformed input is a 400, not a thrown TypeError surfaced as 500.
    const hasExplicitDate = typeof body === 'object' && body !== null && 'completedAt' in body
    let completedAtDate: Date

    if (!hasExplicitDate) {
      completedAtDate = new Date()
    } else if (body.completedAt === null) {
      // A COMPLETED session must have a completedAt, or history.get.ts (which
      // filters `completedAt: { not: null }`) would never surface it.
      throw createError({ statusCode: 400, statusMessage: 'completedAt cannot be null when completing a session' })
    } else {
      completedAtDate = new Date(body.completedAt)
      if (isNaN(completedAtDate.getTime())) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid completedAt date' })
      }
      if (completedAtDate.getTime() > Date.now()) {
        throw createError({ statusCode: 400, statusMessage: 'completedAt cannot be in the future' })
      }
    }

    // Complete the session with a single conditional update. The
    // `status: { not: 'COMPLETED' }` + `userId` filter revalidates the row at
    // write time, so there is no read-then-write gap: a concurrent completion
    // or deletion matches zero rows instead of causing a lost update (an
    // overwritten completedAt), two racing completions both succeeding, or a
    // P2025-driven 500. (`{ not: 'COMPLETED' }` — rather than only
    // 'IN_PROGRESS' — keeps an EDITING session completable, as before.)
    const { count } = await prisma.standaloneWorkoutSession.updateMany({
      where: { id, userId, status: { not: 'COMPLETED' } },
      data: { status: 'COMPLETED', completedAt: completedAtDate },
    })

    if (count === 0) {
      // Nothing matched — re-read to map the reason. Since the filter excludes
      // only COMPLETED rows, an owned row that failed to match is already
      // completed (409); a missing row (e.g. concurrently deleted) or one owned
      // by another user is a 404.
      const current = await prisma.standaloneWorkoutSession.findUnique({
        where: { id },
        select: { userId: true },
      })
      // A missing row and one owned by another user return the SAME 404 so a
      // caller cannot distinguish "does not exist" from "not yours".
      if (!current || current.userId !== userId) {
        throw createError({ statusCode: 404, statusMessage: 'Session not found' })
      }
      throw createError({ statusCode: 409, statusMessage: 'Session already completed' })
    }

    // updateMany returns only a count; read the completed row for the response.
    const updatedSession = await prisma.standaloneWorkoutSession.findUnique({
      where: { id },
    })

    return { session: updatedSession }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'PATCH /api/standalone-workout-sessions/:id/complete' }, '[PATCH /api/standalone-workout-sessions/:id/complete] Failed to complete session')
    throw createError({ statusCode: 500, statusMessage: 'Failed to complete standalone workout session' })
  }
})
