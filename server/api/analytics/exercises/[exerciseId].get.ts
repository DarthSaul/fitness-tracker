defineRouteMeta({
  openAPI: {
    tags: ['Analytics'],
    summary: 'Get exercise history',
    description: 'Returns the full history for a single exercise, one entry per completed session (program and standalone), ordered oldest to newest. Includes per-set e1RM (Epley formula) and session-level best e1RM and total volume. Standalone entries have type STANDALONE, null weekNumber/dayNumber, and a workoutLabel.',
    responses: {
      200: { description: 'Exercise history with per-session set detail' },
      401: { description: 'Unauthorized' },
      404: { description: 'Exercise not found' },
      500: { description: 'Internal server error' },
    },
  },
})

/**
 * Epley e1RM formula: weight * (1 + reps / 30).
 * Returns null if reps or weight is null, zero, or negative.
 */
function computeE1rm(reps: number | null, weight: number | null): number | null {
  if (reps == null || weight == null || reps <= 0 || weight <= 0) return null
  return weight * (1 + reps / 30)
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const exerciseId = getRouterParam(event, 'exerciseId')

  if (!exerciseId) {
    throw createError({ statusCode: 400, statusMessage: 'exerciseId is required' })
  }

  try {
    const exercise = await prisma.exercise.findUnique({
      where: { id: exerciseId },
      select: { id: true, name: true },
    })

    if (!exercise) {
      throw createError({ statusCode: 404, statusMessage: 'Exercise not found' })
    }

    const [completedSets, standaloneCompletedSets] = await Promise.all([
      prisma.completedSet.findMany({
        where: {
          workoutSession: { userId, status: 'COMPLETED' },
          // Prescribed sets link via exerciseSet; extra sets carry only
          // programExerciseId — both belong in the trend.
          OR: [
            { exerciseSet: { programExercise: { exerciseId } } },
            { programExercise: { exerciseId } },
          ],
        },
        include: {
          workoutSession: {
            select: { id: true, completedAt: true, weekNumber: true, dayNumber: true },
          },
        },
        orderBy: { workoutSession: { completedAt: 'asc' } },
      }),
      prisma.standaloneCompletedSet.findMany({
        where: {
          session: { userId, status: 'COMPLETED' },
          set: { standaloneWorkoutExercise: { exerciseId } },
        },
        include: {
          session: {
            select: {
              id: true,
              completedAt: true,
              standaloneWorkout: { select: { name: true, category: true } },
            },
          },
        },
        orderBy: { session: { completedAt: 'asc' } },
      }),
    ])

    // Normalize both families to one row shape before grouping. completedAt is
    // nullable in the schema; COMPLETED sessions always have it in practice,
    // but skip defensively to avoid a runtime crash if null.
    type Row = {
      sessionId: string
      completedAt: Date
      type: 'PROGRAM' | 'STANDALONE'
      weekNumber: number | null
      dayNumber: number | null
      workoutLabel: string | null
      reps: number | null
      weight: number | null
    }

    const rows: Row[] = []

    for (const cs of completedSets) {
      const { id: sessionId, completedAt, weekNumber, dayNumber } = cs.workoutSession
      if (!completedAt) continue
      rows.push({
        sessionId,
        completedAt,
        type: 'PROGRAM',
        weekNumber,
        dayNumber,
        workoutLabel: null,
        reps: cs.reps,
        weight: cs.weight,
      })
    }

    for (const cs of standaloneCompletedSets) {
      const { id: sessionId, completedAt, standaloneWorkout } = cs.session
      if (!completedAt) continue
      rows.push({
        sessionId,
        completedAt,
        type: 'STANDALONE',
        weekNumber: null,
        dayNumber: null,
        workoutLabel: standaloneWorkout.name ?? standaloneWorkout.category,
        reps: cs.reps,
        weight: cs.weight,
      })
    }

    // Each query is ordered asc, but the merged list is not — re-sort, with
    // sessionId as a deterministic tiebreaker for same-instant sessions.
    rows.sort((a, b) =>
      a.completedAt.getTime() - b.completedAt.getTime()
      || (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0),
    )

    // Group by session id preserving insertion (asc) order
    const sessionMap = new Map<
      string,
      {
        sessionId: string
        completedAt: Date
        type: 'PROGRAM' | 'STANDALONE'
        weekNumber: number | null
        dayNumber: number | null
        workoutLabel: string | null
        sets: { reps: number | null; weight: number | null; e1rm: number | null }[]
      }
    >()

    for (const row of rows) {
      if (!sessionMap.has(row.sessionId)) {
        sessionMap.set(row.sessionId, {
          sessionId: row.sessionId,
          completedAt: row.completedAt,
          type: row.type,
          weekNumber: row.weekNumber,
          dayNumber: row.dayNumber,
          workoutLabel: row.workoutLabel,
          sets: [],
        })
      }

      sessionMap.get(row.sessionId)!.sets.push({
        reps: row.reps,
        weight: row.weight,
        e1rm: computeE1rm(row.reps, row.weight),
      })
    }

    const history = Array.from(sessionMap.values()).map((entry) => {
      const e1rms = entry.sets.map((s) => s.e1rm).filter((v): v is number => v != null)
      const bestE1rm = e1rms.length > 0 ? Math.max(...e1rms) : null

      let totalVolume: number | null = null
      for (const set of entry.sets) {
        if (set.reps != null && set.weight != null) {
          totalVolume = (totalVolume ?? 0) + set.reps * set.weight
        }
      }

      return {
        sessionId: entry.sessionId,
        completedAt: entry.completedAt.toISOString(),
        type: entry.type,
        weekNumber: entry.weekNumber,
        dayNumber: entry.dayNumber,
        workoutLabel: entry.workoutLabel,
        sets: entry.sets,
        bestE1rm,
        totalVolume,
      }
    })

    return { exercise, history }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/analytics/exercises/:exerciseId', exerciseId }, 'Failed to fetch exercise history')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch exercise history' })
  }
})
