defineRouteMeta({
  openAPI: {
    tags: ['Standalone Workout Sessions'],
    summary: 'Record a completed set in a standalone session',
    description: 'Records a completed set within an in-progress standalone workout session. Provide exactly one of `standaloneWorkoutSetId` (a prescribed set, validated to belong to this workout) or `adhocExerciseName` (an off-plan exercise).',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'StandaloneWorkoutSession CUID' },
    ],
    responses: {
      201: { description: 'Completed set recorded' },
      400: { description: 'Missing or invalid fields' },
      401: { description: 'Unauthorized' },
      404: { description: 'Session or set not found' },
      409: { description: 'Session already completed or duplicate set submission' },
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
    const { standaloneWorkoutSetId, adhocExerciseName, reps, weight, rpe, notes } = body || {}

    const hasSetId = typeof standaloneWorkoutSetId === 'string' && standaloneWorkoutSetId.trim() !== ''
    const hasAdhoc = typeof adhocExerciseName === 'string' && adhocExerciseName.trim() !== ''

    // Exactly one discriminator (mirrors the DB CHECK constraint)
    if (hasSetId === hasAdhoc) {
      throw createError({ statusCode: 400, statusMessage: 'Provide exactly one of standaloneWorkoutSetId or adhocExerciseName' })
    }

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

    // Transaction prevents a TOCTOU race between the status check and the insert.
    const completedSet = await prisma.$transaction(async (tx) => {
      const session = await tx.standaloneWorkoutSession.findUnique({ where: { id } })

      if (!session) {
        throw createError({ statusCode: 404, statusMessage: 'Session not found' })
      }

      if (session.userId !== userId) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found' })
      }

      if (session.status === 'COMPLETED') {
        throw createError({ statusCode: 409, statusMessage: 'Session already completed' })
      }

      if (hasSetId) {
        // Validate the prescribed set belongs to this session's workout
        const set = await tx.standaloneWorkoutSet.findUnique({
          where: { id: standaloneWorkoutSetId },
          include: { standaloneWorkoutExercise: { include: { group: true } } },
        })

        if (!set) {
          throw createError({ statusCode: 404, statusMessage: 'Exercise set not found' })
        }

        if (set.standaloneWorkoutExercise.group.standaloneWorkoutId !== session.standaloneWorkoutId) {
          throw createError({ statusCode: 400, statusMessage: 'Exercise set does not belong to this workout' })
        }

        return tx.standaloneCompletedSet.create({
          data: { standaloneWorkoutSessionId: id, standaloneWorkoutSetId, reps, weight, rpe, notes },
        })
      }

      return tx.standaloneCompletedSet.create({
        data: { standaloneWorkoutSessionId: id, adhocExerciseName, reps, weight, rpe, notes },
      })
    })

    event.node.res.statusCode = 201
    return completedSet
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    if ((error as { code?: string }).code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Set already recorded for this session' })
    }
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/standalone-workout-sessions/:id/sets' }, '[POST /api/standalone-workout-sessions/:id/sets] Failed to record completed set')
    throw createError({ statusCode: 500, statusMessage: 'Failed to record completed set' })
  }
})
