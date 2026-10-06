import type { Prisma, WeekStartDay } from '@prisma/client'

/**
 * The signed-in user's own profile and settings, as GET and PATCH
 * /api/auth/me return them. The only shape that includes the caller's email.
 */
export const meSelect = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  ptRoutineInWorkout: true,
  profileVisibility: true,
  username: true,
  bio: true,
  // Profile-stats settings (docs/social/SPEC-profile-stats.md); only the owner sees them.
  showActiveProgram: true,
  showWorkoutCount: true,
  // Weekly goal (docs/weekly-goal/SPEC-weekly-goal.md); private, never in any other user shape.
  weeklyWorkoutGoalEnabled: true,
  weeklyWorkoutGoal: true,
  weekStartDay: true,
} satisfies Prisma.UserSelect

export const BIO_MAX = 100

/**
 * A profile bio: trimmed, at most BIO_MAX Unicode code points, blank or
 * null → null. Code points are what the database's char_length CHECK counts:
 * 💪 is 1 (JS `.length` would say 2), while a combined emoji counts all of
 * its code points (👨‍👩‍👧 is 5, 🇬🇧 is 2).
 * @throws {H3Error} 400
 */
export function parseBio(raw: unknown): string | null {
  if (raw === null) return null
  if (typeof raw !== 'string') {
    throw createError({ statusCode: 400, statusMessage: `bio must be a string of up to ${BIO_MAX} characters` })
  }
  const bio = raw.trim()
  if ([...bio].length > BIO_MAX) {
    throw createError({ statusCode: 400, statusMessage: `bio must be a string of up to ${BIO_MAX} characters` })
  }
  return bio || null
}

/** The weekly goal's upper bound; the database CHECK enforces the same 1–7. */
export const WEEKLY_GOAL_MAX = 7

/**
 * A weekly workout goal: an integer from 1 to WEEKLY_GOAL_MAX. Null is not
 * "no goal" — disabling is `weeklyWorkoutGoalEnabled: false`, which keeps the number.
 * @throws {H3Error} 400
 */
export function parseWeeklyWorkoutGoal(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > WEEKLY_GOAL_MAX) {
    throw createError({ statusCode: 400, statusMessage: `weeklyWorkoutGoal must be an integer from 1 to ${WEEKLY_GOAL_MAX}` })
  }
  return raw
}

/** The days a week can start on, in `getUTCDay()` order (SUNDAY = 0), which `weekBounds` relies on. */
export const WEEK_START_DAYS = [
  'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY',
] as const satisfies readonly WeekStartDay[]

/**
 * The first day of the user's week, as the uppercase enum name.
 * @throws {H3Error} 400
 */
export function parseWeekStartDay(raw: unknown): WeekStartDay {
  if (typeof raw !== 'string' || !(WEEK_START_DAYS as readonly string[]).includes(raw)) {
    throw createError({ statusCode: 400, statusMessage: `weekStartDay must be one of ${WEEK_START_DAYS.join(', ')}` })
  }
  return raw as WeekStartDay
}
