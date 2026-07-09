defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Update a core set',
    description: 'Updates the durationSeconds, reps, or notes on an existing core set. At least one of durationSeconds/reps must remain set after the update. Works on both in-progress and completed sessions.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'WorkoutSession CUID' },
      { name: 'coreSetId', in: 'path', required: true, schema: { type: 'string' }, description: 'CompletedCoreSet CUID' },
    ],
    responses: {
      200: { description: 'Updated core set' },
      400: { description: 'Invalid fields' },
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
    const body = await readBody(event)
    const { durationSeconds, reps, notes } = body || {}

    if (durationSeconds !== undefined && durationSeconds !== null && (!Number.isInteger(durationSeconds) || durationSeconds < 0)) {
      throw createError({ statusCode: 400, statusMessage: 'durationSeconds must be a non-negative integer' })
    }
    if (reps !== undefined && reps !== null && (!Number.isInteger(reps) || reps < 0)) {
      throw createError({ statusCode: 400, statusMessage: 'reps must be a non-negative integer' })
    }
    if (notes !== undefined && notes !== null && (typeof notes !== 'string' || notes.length > 500)) {
      throw createError({ statusCode: 400, statusMessage: 'notes must be a string of 500 characters or less' })
    }

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

    // Enforce the invariant post-update: at least one of durationSeconds/reps remains set
    const effectiveDuration = durationSeconds !== undefined ? durationSeconds : coreSet.durationSeconds
    const effectiveReps = reps !== undefined ? reps : coreSet.reps
    if (effectiveDuration === null && effectiveReps === null) {
      throw createError({ statusCode: 400, statusMessage: 'At least one of durationSeconds or reps is required' })
    }

    const updated = await prisma.completedCoreSet.update({
      where: { id: coreSetId },
      data: {
        ...(durationSeconds !== undefined && { durationSeconds }),
        ...(reps !== undefined && { reps }),
        ...(notes !== undefined && { notes }),
      },
      include: { exercise: { select: { id: true, name: true } } },
    })

    return updated
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'PATCH /api/workouts/:id/core-sets/:coreSetId' }, '[PATCH /api/workouts/:id/core-sets/:coreSetId] Failed to update core set')
    throw createError({ statusCode: 500, statusMessage: 'Failed to update core set' })
  }
})
