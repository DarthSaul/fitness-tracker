defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Log a core set',
    description: 'Records a core exercise entry in the session\'s core section. Unlike regular sets, core sets log time (durationSeconds) and/or reps — at least one is required. The session must be in progress and have a core section added.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'WorkoutSession CUID' },
    ],
    responses: {
      201: { description: 'Core set logged' },
      400: { description: 'Missing or invalid fields, or exercise is not a core exercise' },
      401: { description: 'Unauthorized' },
      404: { description: 'Session or exercise not found' },
      409: { description: 'Session is not in progress or core section not added' },
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
    const { exerciseId, durationSeconds, reps, notes } = body || {}

    if (typeof exerciseId !== 'string' || !exerciseId.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'Missing exerciseId' })
    }

    if (durationSeconds !== undefined && durationSeconds !== null && (!Number.isInteger(durationSeconds) || durationSeconds < 0)) {
      throw createError({ statusCode: 400, statusMessage: 'durationSeconds must be a non-negative integer' })
    }
    if (reps !== undefined && reps !== null && (!Number.isInteger(reps) || reps < 0)) {
      throw createError({ statusCode: 400, statusMessage: 'reps must be a non-negative integer' })
    }
    if ((durationSeconds === undefined || durationSeconds === null) && (reps === undefined || reps === null)) {
      throw createError({ statusCode: 400, statusMessage: 'At least one of durationSeconds or reps is required' })
    }
    if (notes !== undefined && notes !== null && (typeof notes !== 'string' || notes.length > 500)) {
      throw createError({ statusCode: 400, statusMessage: 'notes must be a string of 500 characters or less' })
    }

    // Wrap in transaction to prevent TOCTOU race between status check and insert
    const completedCoreSet = await prisma.$transaction(async (tx) => {
      const session = await tx.workoutSession.findUnique({ where: { id } })

      if (!session) {
        throw createError({ statusCode: 404, statusMessage: 'Session not found' })
      }

      if (session.userId !== userId) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found' })
      }

      if (session.status !== 'IN_PROGRESS') {
        throw createError({ statusCode: 409, statusMessage: 'Session is not in progress' })
      }

      if (session.coreSectionAddedAt === null) {
        throw createError({ statusCode: 409, statusMessage: 'Core section not added to this session' })
      }

      const exercise = await tx.exercise.findUnique({ where: { id: exerciseId } })

      if (!exercise) {
        throw createError({ statusCode: 404, statusMessage: 'Exercise not found' })
      }

      if (!exercise.isCore) {
        throw createError({ statusCode: 400, statusMessage: 'Exercise is not a core exercise' })
      }

      return tx.completedCoreSet.create({
        data: {
          workoutSessionId: id,
          exerciseId,
          durationSeconds: durationSeconds ?? null,
          reps: reps ?? null,
          notes: notes ?? null,
        },
        include: { exercise: { select: { id: true, name: true } } },
      })
    })

    event.node.res.statusCode = 201
    return completedCoreSet
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/workouts/:id/core-sets' }, '[POST /api/workouts/:id/core-sets] Failed to log core set')
    throw createError({ statusCode: 500, statusMessage: 'Failed to log core set' })
  }
})
