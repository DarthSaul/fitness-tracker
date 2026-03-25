defineRouteMeta({
  openAPI: {
    tags: ['Analytics'],
    summary: 'Get dashboard summary stats',
    description: 'Returns high-level analytics for the authenticated user: total sessions, total volume, current and longest streaks, last workout timestamp, and distinct exercise count.',
    responses: {
      200: { description: 'Dashboard summary stats' },
      401: { description: 'Unauthorized' },
      500: { description: 'Internal server error' },
    },
  },
})

/**
 * Given a sorted (ascending) array of unique UTC calendar day strings (YYYY-MM-DD),
 * compute the longest streak and the current streak (counting back from today).
 */
function computeStreaks(dates: Date[]): { longestStreakDays: number; currentStreakDays: number } {
  if (dates.length === 0) {
    return { longestStreakDays: 0, currentStreakDays: 0 }
  }

  // Deduplicate to unique UTC calendar day strings
  const daySet = new Set(dates.map((d) => d.toISOString().slice(0, 10)))
  const sortedDays = Array.from(daySet).sort()

  // Compute longest streak
  let longestStreakDays = 1
  let currentRun = 1

  for (let i = 1; i < sortedDays.length; i++) {
    const prev = new Date(sortedDays[i - 1]!)
    const curr = new Date(sortedDays[i]!)
    const diffMs = curr.getTime() - prev.getTime()
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 1) {
      currentRun++
      if (currentRun > longestStreakDays) {
        longestStreakDays = currentRun
      }
    } else {
      currentRun = 1
    }
  }

  // Compute current streak: walk backward from the last day
  // Only count if the last day is today or yesterday (UTC)
  const todayStr = new Date().toISOString().slice(0, 10)
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const lastDay = sortedDays[sortedDays.length - 1]!

  let currentStreakDays = 0

  if (lastDay === todayStr || lastDay === yesterdayStr) {
    currentStreakDays = 1

    for (let i = sortedDays.length - 2; i >= 0; i--) {
      const curr = new Date(sortedDays[i + 1]!)
      const prev = new Date(sortedDays[i]!)
      const diffMs = curr.getTime() - prev.getTime()
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

      if (diffDays === 1) {
        currentStreakDays++
      } else {
        break
      }
    }
  }

  return { longestStreakDays, currentStreakDays }
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  try {
    const sessions = await prisma.workoutSession.findMany({
      where: { userId, status: 'COMPLETED' },
      include: {
        completedSets: {
          select: {
            reps: true,
            weight: true,
            exerciseSet: {
              include: { programExercise: { select: { exerciseId: true } } },
            },
          },
        },
      },
      orderBy: { completedAt: 'asc' },
    })

    const totalSessions = sessions.length

    let totalVolumeLbs = 0
    const exerciseIdSet = new Set<string>()

    for (const session of sessions) {
      for (const set of session.completedSets) {
        if (set.reps != null && set.weight != null) {
          totalVolumeLbs += set.reps * set.weight
        }
        exerciseIdSet.add(set.exerciseSet.programExercise.exerciseId)
      }
    }

    const totalExercises = exerciseIdSet.size

    const completedAtDates = sessions
      .map((s) => s.completedAt)
      .filter((d): d is Date => d != null)

    const lastWorkoutAt = completedAtDates.length > 0
      ? completedAtDates[completedAtDates.length - 1]!.toISOString()
      : null

    const { longestStreakDays, currentStreakDays } = computeStreaks(completedAtDates)

    return {
      totalSessions,
      totalVolumeLbs,
      currentStreakDays,
      longestStreakDays,
      lastWorkoutAt,
      totalExercises,
    }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[GET /api/analytics/dashboard] Failed to fetch dashboard stats', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch dashboard stats' })
  }
})
