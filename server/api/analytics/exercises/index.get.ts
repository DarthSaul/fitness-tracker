defineRouteMeta({
  openAPI: {
    tags: ['Analytics'],
    summary: 'List exercises with completed sets',
    description: 'Returns all exercises the authenticated user has recorded at least one completed set for, sorted by most recently performed.',
    responses: {
      200: { description: 'List of exercises with session count and last completed date' },
      401: { description: 'Unauthorized' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  try {
    const completedSets = await prisma.completedSet.findMany({
      where: {
        workoutSession: { userId, status: 'COMPLETED' },
      },
      include: {
        workoutSession: { select: { id: true, completedAt: true } },
        exerciseSet: {
          include: {
            programExercise: {
              include: {
                exercise: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    })

    // Group by exercise ID, tracking session IDs and max completedAt
    const exerciseMap = new Map<
      string,
      { id: string; name: string; sessionIds: Set<string>; lastCompletedAt: Date | null }
    >()

    for (const cs of completedSets) {
      const exercise = cs.exerciseSet.programExercise.exercise
      const sessionId = cs.workoutSession.id
      const completedAt = cs.workoutSession.completedAt

      const existing = exerciseMap.get(exercise.id)

      if (!existing) {
        exerciseMap.set(exercise.id, {
          id: exercise.id,
          name: exercise.name,
          sessionIds: new Set([sessionId]),
          lastCompletedAt: completedAt,
        })
      } else {
        existing.sessionIds.add(sessionId)
        if (
          completedAt != null &&
          (existing.lastCompletedAt == null || completedAt > existing.lastCompletedAt)
        ) {
          existing.lastCompletedAt = completedAt
        }
      }
    }

    const result = Array.from(exerciseMap.values())
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        sessionCount: entry.sessionIds.size,
        lastCompletedAt: (entry.lastCompletedAt ?? new Date(0)).toISOString(),
      }))
      .sort((a, b) => (a.lastCompletedAt < b.lastCompletedAt ? 1 : -1))

    return result
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[GET /api/analytics/exercises] Failed to fetch exercise list', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch exercise list' })
  }
})
