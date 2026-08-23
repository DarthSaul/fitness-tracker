defineRouteMeta({
  openAPI: {
    tags: ['Analytics'],
    summary: 'List exercises with completed sets',
    description: 'Returns all exercises the authenticated user has recorded at least one completed set for, across program and standalone workout sessions, sorted by most recently performed.',
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
    const [completedSets, standaloneCompletedSets] = await Promise.all([
      prisma.completedSet.findMany({
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
          programExercise: {
            include: {
              exercise: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.standaloneCompletedSet.findMany({
        where: {
          session: { userId, status: 'COMPLETED' },
        },
        include: {
          session: { select: { id: true, completedAt: true } },
          set: {
            include: {
              standaloneWorkoutExercise: {
                include: { exercise: { select: { id: true, name: true } } },
              },
            },
          },
        },
      }),
    ])

    // Group by exercise ID, tracking session IDs and max completedAt. Session
    // ids from both families share one Set — cuids are globally unique.
    const exerciseMap = new Map<
      string,
      { id: string; name: string; sessionIds: Set<string>; lastCompletedAt: Date | null }
    >()

    function addSet(
      exercise: { id: string; name: string },
      sessionId: string,
      completedAt: Date | null,
    ) {
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

    for (const cs of completedSets) {
      if (!cs.exerciseSet && !cs.programExercise) continue
      const exercise = cs.exerciseSet
        ? cs.exerciseSet.programExercise.exercise
        : cs.programExercise!.exercise
      addSet(exercise, cs.workoutSession.id, cs.workoutSession.completedAt)
    }

    for (const cs of standaloneCompletedSets) {
      // Ad-hoc sets (free-text name, no linked exercise) carry no exercise identity
      if (!cs.set) continue
      addSet(cs.set.standaloneWorkoutExercise.exercise, cs.session.id, cs.session.completedAt)
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
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/analytics/exercises' }, '[GET /api/analytics/exercises] Failed to fetch exercise list')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch exercise list' })
  }
})
