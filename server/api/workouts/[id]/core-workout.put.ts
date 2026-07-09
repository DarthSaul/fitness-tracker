defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Create or replace the core workout for a session',
    description: 'Saves the timed core circuit plan for a workout session: global work/rest seconds and an ordered list of core exercise IDs (each entry is one interval; array index drives the order). Replaces any previously saved plan and clears its completion state. The interval timer runs client-side.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'WorkoutSession CUID' },
    ],
    responses: {
      200: { description: 'Saved core workout with ordered exercises' },
      400: { description: 'Missing or invalid fields, or a non-core exercise' },
      401: { description: 'Unauthorized' },
      404: { description: 'Session or exercise not found' },
      409: { description: 'Session is not in progress or concurrent save' },
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
    const { timeSeconds, restSeconds, exerciseIds } = body || {}

    if (!Number.isInteger(timeSeconds) || timeSeconds < 1 || timeSeconds > 3600) {
      throw createError({ statusCode: 400, statusMessage: 'timeSeconds must be an integer between 1 and 3600' })
    }
    if (!Number.isInteger(restSeconds) || restSeconds < 0 || restSeconds > 3600) {
      throw createError({ statusCode: 400, statusMessage: 'restSeconds must be an integer between 0 and 3600' })
    }
    if (!Array.isArray(exerciseIds) || exerciseIds.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'exerciseIds must be a non-empty array' })
    }
    if (exerciseIds.length > 50) {
      throw createError({ statusCode: 400, statusMessage: 'exerciseIds must contain 50 or fewer entries' })
    }
    if (exerciseIds.some((exerciseId: unknown) => typeof exerciseId !== 'string' || !exerciseId.trim())) {
      throw createError({ statusCode: 400, statusMessage: 'exerciseIds must contain exercise ID strings' })
    }

    // Wrap in transaction so the plan replacement (upsert + delete + recreate
    // of ordered entries) is atomic and cannot interleave with a concurrent save
    const coreWorkout = await prisma.$transaction(async (tx) => {
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

      // Duplicates in the circuit are allowed; validate each distinct exercise once
      const uniqueIds = [...new Set(exerciseIds as string[])]
      const exercises = await tx.exercise.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true, isCore: true },
      })

      if (exercises.length !== uniqueIds.length) {
        throw createError({ statusCode: 404, statusMessage: 'Exercise not found' })
      }

      if (exercises.some((exercise: { isCore: boolean }) => !exercise.isCore)) {
        throw createError({ statusCode: 400, statusMessage: 'All exercises must be core exercises' })
      }

      const saved = await tx.coreWorkout.upsert({
        where: { workoutSessionId: id },
        update: { timeSeconds, restSeconds, completedAt: null },
        create: { workoutSessionId: id, timeSeconds, restSeconds },
      })

      await tx.coreWorkoutExercise.deleteMany({ where: { coreWorkoutId: saved.id } })

      await tx.coreWorkoutExercise.createMany({
        data: (exerciseIds as string[]).map((exerciseId, index) => ({
          coreWorkoutId: saved.id,
          exerciseId,
          order: index + 1,
        })),
      })

      return tx.coreWorkout.findUnique({
        where: { id: saved.id },
        include: {
          exercises: {
            orderBy: { order: 'asc' },
            include: { exercise: { select: { id: true, name: true } } },
          },
        },
      })
    })

    return coreWorkout
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    if ((error as { code?: string }).code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Core workout was saved concurrently — retry' })
    }
    ;(event.context.logger ?? logger).error({ err: error, route: 'PUT /api/workouts/:id/core-workout' }, '[PUT /api/workouts/:id/core-workout] Failed to save core workout')
    throw createError({ statusCode: 500, statusMessage: 'Failed to save core workout' })
  }
})
