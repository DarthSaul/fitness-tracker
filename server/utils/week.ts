import type { WeekStartDay } from '@prisma/client'

/**
 * "This week" for the weekly goal and the analytics dashboard
 * (docs/weekly-goal/SPEC-weekly-goal.md): the user's week start day at local
 * 00:00, up to the same time seven local days later.
 */

const DAY_MS = 86_400_000

/** An IANA zone name, or a fixed offset in minutes east of UTC (the dashboard's legacy `tzOffset`). */
export type WeekZone = string | number

export interface WeekBounds {
  /** Inclusive. */
  start: Date
  /** Exclusive: the next week's start. 167 or 169 hours after `start` in a DST-change week. */
  end: Date
}

const formatters = new Map<string, Intl.DateTimeFormat>()

/** Minutes east of UTC that `zone` is at `instantMs`. */
function offsetMinutes(zone: WeekZone, instantMs: number): number {
  if (typeof zone === 'number') return zone
  let format = formatters.get(zone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    })
    formatters.set(zone, format)
  }
  const part = Object.fromEntries(format.formatToParts(instantMs).map((p) => [p.type, Number(p.value)]))
  const wallClockMs = Date.UTC(part.year!, part.month! - 1, part.day!, part.hour!, part.minute!, part.second!)
  return Math.round((wallClockMs - (instantMs - (instantMs % 1000))) / 60_000)
}

/**
 * The UTC instant at which `zone`'s wall clock reads `localMs` (a wall-clock
 * time encoded as if it were UTC). Tries the offsets in force a day either
 * side, and keeps the earliest that round-trips. If neither does, that wall
 * time was skipped by a DST jump (e.g. Santiago's 00:00 → 01:00), so the
 * answer is the jump itself, the first instant that exists after it.
 */
function localToUtc(localMs: number, zone: WeekZone): number {
  const candidates = [offsetMinutes(zone, localMs - DAY_MS), offsetMinutes(zone, localMs + DAY_MS)]
    .map((offset) => localMs - offset * 60_000)
  const valid = candidates.filter((utc) => utc + offsetMinutes(zone, utc) * 60_000 === localMs)
  return valid.length > 0 ? Math.min(...valid) : Math.max(...candidates)
}

/** The user's current week around `now`: local `startDay` 00:00 in `zone`, for seven local days. */
export function weekBounds(now: Date, startDay: WeekStartDay, zone: WeekZone): WeekBounds {
  const local = new Date(now.getTime() + offsetMinutes(zone, now.getTime()) * 60_000)
  // WEEK_START_DAYS is in getUTCDay() order, so its index is the day number.
  const daysBack = (local.getUTCDay() - WEEK_START_DAYS.indexOf(startDay) + 7) % 7
  const startDate = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysBack)
  return {
    start: new Date(localToUtc(startDate, zone)),
    end: new Date(localToUtc(startDate + 7 * DAY_MS, zone)),
  }
}

/**
 * The optional `?timeZone=` query param: undefined when absent, so the caller
 * falls back to the stored zone. Anything else must be a named IANA zone.
 * @throws {H3Error} 400
 */
export function parseTimeZoneParam(raw: unknown): string | undefined {
  if (raw === undefined) return undefined
  if (!isValidTimeZone(raw)) {
    throw createError({ statusCode: 400, statusMessage: 'timeZone must be an IANA time zone, e.g. America/Chicago' })
  }
  return raw
}

/**
 * Completed workouts, program and standalone, whose `completedAt` falls in
 * `[start, end)`. `completedAt` is the date on the workout's record, so an
 * edited or backdated workout counts in the week it is dated to.
 */
export async function completedWorkoutsBetween(userId: string, start: Date, end: Date): Promise<number> {
  const where = { userId, status: 'COMPLETED' as const, completedAt: { gte: start, lt: end } }
  const [program, standalone] = await Promise.all([
    prisma.workoutSession.count({ where }),
    prisma.standaloneWorkoutSession.count({ where }),
  ])
  return program + standalone
}
