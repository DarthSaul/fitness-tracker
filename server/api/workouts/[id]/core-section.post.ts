defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Add a core section to a workout',
    description: 'Marks the workout session as having a core section so the client can log core exercises (time and/or reps) at the end of the workout. The section persists on the session before any core sets are logged.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'WorkoutSession CUID' },
    ],
    responses: {
      201: { description: 'Core section added; returns the updated session' },
      400: { description: 'Missing session ID' },
      401: { description: 'Unauthorized' },
      404: { description: 'Session not found' },
      409: { description: 'Session is not in progress or core section already added' },
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
    // Wrap in transaction to prevent TOCTOU race between status check and update
    const session = await prisma.$transaction(async (tx) => {
      const existing = await tx.workoutSession.findUnique({ where: { id } })

      if (!existing) {
        throw createError({ statusCode: 404, statusMessage: 'Session not found' })
      }

      if (existing.userId !== userId) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found' })
      }

      if (existing.status !== 'IN_PROGRESS') {
        throw createError({ statusCode: 409, statusMessage: 'Session is not in progress' })
      }

      if (existing.coreSectionAddedAt !== null) {
        throw createError({ statusCode: 409, statusMessage: 'Core section already added' })
      }

      return tx.workoutSession.update({
        where: { id },
        data: { coreSectionAddedAt: new Date() },
      })
    })

    event.node.res.statusCode = 201
    return session
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/workouts/:id/core-section' }, '[POST /api/workouts/:id/core-section] Failed to add core section')
    throw createError({ statusCode: 500, statusMessage: 'Failed to add core section' })
  }
})
