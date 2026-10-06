defineRouteMeta({
  openAPI: {
    tags: ['Analytics'],
    summary: 'Get dashboard summary stats',
    description: 'Returns high-level analytics for the authenticated user across program and standalone workout sessions: total sessions, total volume, current and longest streaks, last workout timestamp, distinct exercise count, and `sessionsThisWeek`. The week is the same one GET /api/weekly-goal uses: local 00:00 on the user\'s `weekStartDay` (default SUNDAY) for seven local days, in the `timeZone` param, else the legacy `tzOffset`, else the stored `User.timezone`, else UTC.',
    parameters: [
      { name: 'timeZone', in: 'query', required: false, schema: { type: 'string', example: 'America/Chicago' }, description: 'IANA zone for "this week"; preferred over tzOffset' },
      { name: 'tzOffset', in: 'query', required: false, schema: { type: 'integer', example: -300 }, description: 'Legacy: minutes east of UTC. Ignored when timeZone is sent; misses DST changes' },
    ],
    responses: {
      200: { description: 'Dashboard summary stats' },
      400: { description: 'timeZone is not an IANA zone' },
      401: { description: 'Unauthorized' },
      404: { description: 'User not found' },
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
    const query = getQuery(event)
    const timeZoneParam = parseTimeZoneParam(query.timeZone)

    const [user, sessions, standaloneSessions] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { weekStartDay: true, timezone: true } }),
      prisma.workoutSession.findMany({
        where: { userId, status: 'COMPLETED' },
        include: {
          completedSets: {
            select: {
              reps: true,
              weight: true,
              exerciseSet: {
                include: { programExercise: { select: { exerciseId: true } } },
              },
              programExercise: { select: { exerciseId: true } },
            },
          },
        },
        orderBy: { completedAt: 'asc' },
      }),
      prisma.standaloneWorkoutSession.findMany({
        where: { userId, status: 'COMPLETED' },
        include: {
          completedSets: {
            select: {
              reps: true,
              weight: true,
              set: {
                select: { standaloneWorkoutExercise: { select: { exerciseId: true } } },
              },
            },
          },
        },
        orderBy: { completedAt: 'asc' },
      }),
    ])
    if (!user) {
      throw createError({ statusCode: 404, statusMessage: 'User not found' })
    }

    const totalSessions = sessions.length + standaloneSessions.length

    let totalVolumeLbs = 0
    const exerciseIdSet = new Set<string>()

    for (const session of sessions) {
      for (const set of session.completedSets) {
        if (set.reps != null && set.weight != null) {
          totalVolumeLbs += set.reps * set.weight
        }
        if (set.exerciseSet) {
          exerciseIdSet.add(set.exerciseSet.programExercise.exerciseId)
        } else if (set.programExercise) {
          exerciseIdSet.add(set.programExercise.exerciseId)
        }
      }
    }

    for (const session of standaloneSessions) {
      for (const set of session.completedSets) {
        // Volume counts every set, ad-hoc included — same as the program loop,
        // where ad-hoc sets add volume but no exercise identity.
        if (set.reps != null && set.weight != null) {
          totalVolumeLbs += set.reps * set.weight
        }
        if (set.set) {
          exerciseIdSet.add(set.set.standaloneWorkoutExercise.exerciseId)
        }
      }
    }

    const totalExercises = exerciseIdSet.size

    // Each query is ordered asc, but the merged list is not — re-sort, since
    // lastWorkoutAt takes the final element and computeStreaks expects order.
    const completedAtDates = [...sessions, ...standaloneSessions]
      .map((s) => s.completedAt)
      .filter((d): d is Date => d != null)
      .sort((a, b) => a.getTime() - b.getTime())

    const lastWorkoutAt = completedAtDates.length > 0
      ? completedAtDates[completedAtDates.length - 1]!.toISOString()
      : null

    const { longestStreakDays, currentStreakDays } = computeStreaks(completedAtDates)

    // The user's week, as GET /api/weekly-goal computes it (docs/weekly-goal/SPEC-weekly-goal.md).
    // Zone: the timeZone param, else the legacy tzOffset (minutes east of UTC,
    // e.g. UTC-5 → -300, still sent by web bundles the PWA has cached), else the
    // stored zone, else UTC.
    const { tzOffset } = query
    const legacyOffset = typeof tzOffset === 'string' && Number.isFinite(Number(tzOffset)) ? parseInt(tzOffset, 10) : undefined
    const zone = timeZoneParam ?? legacyOffset ?? (isValidTimeZone(user.timezone) ? user.timezone : 'UTC')
    const { start, end } = weekBounds(new Date(), user.weekStartDay, zone)
    const sessionsThisWeek = completedAtDates.filter((d) => d >= start && d < end).length

    return {
      totalSessions,
      totalVolumeLbs,
      currentStreakDays,
      longestStreakDays,
      lastWorkoutAt,
      totalExercises,
      sessionsThisWeek,
    }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/analytics/dashboard' }, '[GET /api/analytics/dashboard] Failed to fetch dashboard stats')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch dashboard stats' })
  }
})
