defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Get active workout session',
    description: 'Returns the user\'s in-progress workout session with the full day template, already-completed sets, and any logged core sets. Returns 404 if no active session exists.',
    responses: {
      200: { description: 'Active workout session with day template and completed sets' },
      401: { description: 'Unauthorized' },
      404: { description: 'No active workout session' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  try {
    const session = await prisma.workoutSession.findFirst({
      where: { userId, status: 'IN_PROGRESS' },
      include: {
        completedSets: true,
        workoutExerciseSwaps: true,
        userProgram: true,
        completedCoreSets: {
          orderBy: { completedAt: 'asc' },
          include: { exercise: { select: { id: true, name: true } } },
        },
      },
    })

    if (!session) {
      throw createError({ statusCode: 404, statusMessage: 'No active workout session' })
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
                exercise: { select: { id: true, name: true } },
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
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/workouts/active' }, '[GET /api/workouts/active] Failed to fetch active session')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch active session' })
  }
})
