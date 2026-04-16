defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Get a workout session by ID',
    description: 'Returns a specific workout session with completed sets and the full day template. Works for both in-progress and completed sessions.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'WorkoutSession CUID' },
    ],
    responses: {
      200: { description: 'Workout session with day template and completed sets' },
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
    const session = await prisma.workoutSession.findUnique({
      where: { id },
      include: {
        completedSets: true,
        userProgram: true,
        workoutExerciseSwaps: true,
      },
    })

    if (!session) {
      throw createError({ statusCode: 404, statusMessage: 'Session not found' })
    }

    if (session.userId !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }

    const day = await prisma.programDay.findFirst({
      where: {
        programWeek: {
          programId: session.userProgram.programId,
          weekNumber: session.weekNumber,
        },
        dayNumber: session.dayNumber,
      },
      include: {
        exerciseGroups: {
          orderBy: { order: 'asc' },
          include: {
            exercises: {
              orderBy: { order: 'asc' },
              include: {
                exercise: { select: { id: true, name: true, description: true } },
                sets: { orderBy: { setNumber: 'asc' } },
              },
            },
          },
        },
      },
    })

    if (!day) {
      throw createError({ statusCode: 500, statusMessage: 'Program day not found for session position' })
    }

    // Apply exercise swaps to the day structure
    const swapMap = new Map(
      session.workoutExerciseSwaps.map((s: { programExerciseId: string; replacementExerciseId: string }) =>
        [s.programExerciseId, s.replacementExerciseId]
      )
    )

    if (swapMap.size > 0) {
      const replacementIds = [...swapMap.values()]
      const replacements = await prisma.exercise.findMany({
        where: { id: { in: replacementIds } },
        select: { id: true, name: true, description: true },
      })
      const replacementMap = new Map(replacements.map((e: { id: string; name: string; description: string | null }) => [e.id, e]))

      for (const group of day.exerciseGroups) {
        for (const ex of group.exercises) {
          const replacementId = swapMap.get(ex.id)
          if (replacementId) {
            const replacement = replacementMap.get(replacementId)
            if (replacement) {
              (ex as unknown as { exercise: typeof replacement }).exercise = replacement
            }
          }
        }
      }
    }

    return { session, day }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[GET /api/workouts/:id] Failed to fetch workout session', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch workout session' })
  }
})
