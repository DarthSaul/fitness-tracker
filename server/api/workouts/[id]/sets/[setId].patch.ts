defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Update a completed set',
    description: 'Updates the reps, weight, RPE, or notes on an existing completed set. Works on both in-progress and completed sessions.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'WorkoutSession CUID' },
      { name: 'setId', in: 'path', required: true, schema: { type: 'string' }, description: 'CompletedSet CUID' },
    ],
    responses: {
      200: { description: 'Updated completed set' },
      400: { description: 'Invalid fields' },
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
    const body = await readBody(event)
    const { reps, weight, rpe, notes } = body || {}

    if (reps !== undefined && reps !== null && (!Number.isFinite(reps) || reps < 0)) {
      throw createError({ statusCode: 400, statusMessage: 'reps must be a non-negative number' })
    }
    if (weight !== undefined && weight !== null && (!Number.isFinite(weight) || weight < 0)) {
      throw createError({ statusCode: 400, statusMessage: 'weight must be a non-negative number' })
    }
    if (rpe !== undefined && rpe !== null && (!Number.isFinite(rpe) || rpe < 0 || rpe > 10)) {
      throw createError({ statusCode: 400, statusMessage: 'rpe must be between 0 and 10' })
    }
    if (notes !== undefined && notes !== null && (typeof notes !== 'string' || notes.length > 500)) {
      throw createError({ statusCode: 400, statusMessage: 'notes must be a string of 500 characters or less' })
    }

    const session = await prisma.workoutSession.findUnique({
      where: { id },
    })

    if (!session) {
      throw createError({ statusCode: 404, statusMessage: 'Session not found' })
    }

    if (session.userId !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }

    const completedSet = await prisma.completedSet.findFirst({
      where: { id: setId, workoutSessionId: id },
    })

    if (!completedSet) {
      throw createError({ statusCode: 404, statusMessage: 'Completed set not found' })
    }

    const updated = await prisma.completedSet.update({
      where: { id: setId },
      data: {
        ...(reps !== undefined && { reps }),
        ...(weight !== undefined && { weight }),
        ...(rpe !== undefined && { rpe }),
        ...(notes !== undefined && { notes }),
      },
    })

    return updated
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[PATCH /api/workouts/:id/sets/:setId] Failed to update completed set', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update completed set' })
  }
})
