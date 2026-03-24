defineRouteMeta({
  openAPI: {
    tags: ['Analytics'],
    summary: 'Get exercise history',
    description: 'Returns the full history for a single exercise, one entry per completed session, ordered oldest to newest. Includes per-set e1RM (Epley formula) and session-level best e1RM and total volume.',
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

    const completedSets = await prisma.completedSet.findMany({
      where: {
        workoutSession: { userId, status: 'COMPLETED' },
        exerciseSet: { programExercise: { exerciseId } },
      },
      include: {
        workoutSession: {
          select: { id: true, completedAt: true, weekNumber: true, dayNumber: true },
        },
      },
      orderBy: { workoutSession: { completedAt: 'asc' } },
    })

    // Group by workoutSessionId preserving insertion (asc) order
    const sessionMap = new Map<
      string,
      {
        sessionId: string
        completedAt: Date
        weekNumber: number
        dayNumber: number
        sets: { reps: number | null; weight: number | null; e1rm: number | null }[]
      }
    >()

    for (const cs of completedSets) {
      const { id: sessionId, completedAt, weekNumber, dayNumber } = cs.workoutSession

      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, {
          sessionId,
          completedAt: completedAt!,
          weekNumber,
          dayNumber,
          sets: [],
        })
      }

      const entry = sessionMap.get(sessionId)!
      entry.sets.push({
        reps: cs.reps,
        weight: cs.weight,
        e1rm: computeE1rm(cs.reps, cs.weight),
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
        weekNumber: entry.weekNumber,
        dayNumber: entry.dayNumber,
        sets: entry.sets,
        bestE1rm,
        totalVolume,
      }
    })

    return { exercise, history }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error(`[GET /api/analytics/exercises/${exerciseId}] Failed to fetch exercise history`, error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch exercise history' })
  }
})
