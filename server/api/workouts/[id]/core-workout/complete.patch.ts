defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Mark the core workout completed',
    description: 'Records that the core circuit finished. Accepts an optional completedAt for backdating; defaults to now. No session-status gate so a circuit can be marked complete even after the session itself was completed.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'WorkoutSession CUID' },
    ],
    responses: {
      200: { description: 'Completed core workout with ordered exercises' },
      400: { description: 'Missing session ID or invalid completedAt' },
      401: { description: 'Unauthorized' },
      404: { description: 'Session or core workout not found' },
      409: { description: 'Core workout already completed' },
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
    let completedAtDate = new Date()

    if (body?.completedAt !== undefined && body?.completedAt !== null) {
      completedAtDate = new Date(body.completedAt)
      if (isNaN(completedAtDate.getTime())) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid completedAt date' })
      }
      if (completedAtDate.getTime() > Date.now()) {
        throw createError({ statusCode: 400, statusMessage: 'completedAt cannot be in the future' })
      }
    }

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

    if (coreWorkout.completedAt !== null) {
      throw createError({ statusCode: 409, statusMessage: 'Core workout already completed' })
    }

    // Atomic conditional write: the completedAt: null guard means only one of
    // two concurrent completion requests can match the row — the loser sees
    // count 0 and gets the same 409 as the pre-check above
    const { count } = await prisma.coreWorkout.updateMany({
      where: { id: coreWorkout.id, completedAt: null },
      data: { completedAt: completedAtDate },
    })

    if (count === 0) {
      throw createError({ statusCode: 409, statusMessage: 'Core workout already completed' })
    }

    const updated = await prisma.coreWorkout.findUnique({
      where: { id: coreWorkout.id },
      include: {
        exercises: {
          orderBy: { order: 'asc' },
          include: { exercise: { select: { id: true, name: true } } },
        },
      },
    })

    if (!updated) {
      throw createError({ statusCode: 404, statusMessage: 'Core workout not found' })
    }

    return updated
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'PATCH /api/workouts/:id/core-workout/complete' }, '[PATCH /api/workouts/:id/core-workout/complete] Failed to complete core workout')
    throw createError({ statusCode: 500, statusMessage: 'Failed to complete core workout' })
  }
})
