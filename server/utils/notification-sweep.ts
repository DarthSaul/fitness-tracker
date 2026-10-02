import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * The scheduled half of the notifications module
 * (docs/notifications/SPEC-notifications.md §6). Supabase pg_cron calls
 * POST /api/internal/notifications/sweep every 5 minutes, which runs this.
 *
 * Every write is idempotent on dedupeKey, so overlapping or repeated runs
 * never notify twice. Each step is isolated: one failing (e.g. a bad time
 * zone) is logged and reported, and the rest still run.
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const SWEEP = {
  /** An IN_PROGRESS session this old gets a "finish your workout" reminder… */
  unfinishedAfterMs: 4 * HOUR,
  /** …unless older than this, so the first deploy doesn't ping every abandoned session. */
  unfinishedLookbackMs: 48 * HOUR,
  /** Max sessions / scheduled workouts queued per run; the rest wait for the next. */
  batch: 200,
  retryBatch: 100,
  /** Leave a fresh notification to its request's own waitUntil push first. */
  retryMinAgeMs: 2 * MINUTE,
  /** A push this late is no longer worth sending. */
  retryMaxAgeMs: HOUR,
  maxPushAttempts: 3,
  pushConcurrency: 10,
  /**
   * Stop starting pushes this long into a run. pg_net gives up after 60 s, and
   * a function cut off mid-push would leave work half-recorded. Anything left
   * over is unpushed, so the retry step picks it up 2 minutes later.
   */
  pushBudgetMs: 40 * 1000,
  dismissedRetentionMs: 30 * DAY,
  retentionMs: 90 * DAY,
} as const

export interface SweepSummary {
  unfinished: number
  reminders: number
  staleDismissed: number
  retried: number
  pushes: Record<DeliveryOutcome, number>
  /** Pushes not started because the time budget ran out; retried next run. */
  deferred: number
  purged: number
  failedSteps: string[]
  durationMs: number
}

interface DueReminder {
  id: string
  userId: string
  weekNumber: number
  dayNumber: number
  programName: string
  /** The workout is today in the user's zone (else tomorrow, for a day-before reminder). */
  isToday: boolean
}

/**
 * Scheduled workouts whose reminder is due now. One setting per user decides
 * the reminder moment for all their workouts: `workoutReminderMinute` on the
 * workout's date (SAME_DAY), or on the day before (DAY_BEFORE), in their zone.
 *
 * A workout is due once that moment has passed and its date hasn't, on the
 * user's active, open run, with no session started for that day, no reminder
 * yet, and reminders not switched off. A reminder missed (job down, zone set
 * late) is sent late rather than dropped, except for a workout scheduled after
 * its own moment: the user has just scheduled it (decided 2026-10-02).
 *
 * Zones are filtered through pg_timezone_names first (MATERIALIZED, so the
 * planner can't reorder it): `AT TIME ZONE` raises on a name Postgres doesn't
 * know, and one bad row must not stop everyone's reminders.
 */
function dueReminders(now: Date): Promise<DueReminder[]> {
  return prisma.$queryRaw<DueReminder[]>`
    WITH tz_users AS MATERIALIZED (
      SELECT u."id", u."timezone", u."workoutReminderMinute",
             CASE u."workoutReminderDay" WHEN 'DAY_BEFORE' THEN 1 ELSE 0 END AS "daysBefore"
      FROM "User" u
      WHERE u."timezone" IN (SELECT "name" FROM pg_timezone_names)
    ),
    d AS (
      SELECT sw."id", sw."userProgramId", sw."weekNumber", sw."dayNumber", sw."scheduledDate", sw."createdAt",
             up."userId", p."name" AS "programName",
             -- date - int is a date; + interval is a local timestamp; AT TIME ZONE makes it an instant.
             ((sw."scheduledDate" - u."daysBefore") + make_interval(mins => u."workoutReminderMinute")) AT TIME ZONE u."timezone" AS "remindAt",
             (${now}::timestamptz AT TIME ZONE u."timezone")::date AS "localToday"
      FROM "ScheduledWorkout" sw
      JOIN "UserProgram" up ON up."id" = sw."userProgramId"
      JOIN "Program" p ON p."id" = up."programId"
      JOIN tz_users u ON u."id" = up."userId"
      WHERE up."isActive" = true
        AND up."completedAt" IS NULL
        AND up."archivedAt" IS NULL
    )
    SELECT d."id", d."userId", d."weekNumber", d."dayNumber", d."programName",
           (d."scheduledDate" = d."localToday") AS "isToday"
    FROM d
    WHERE d."remindAt" <= ${now}::timestamptz
      AND d."scheduledDate" >= d."localToday"
      -- createdAt is a UTC timestamp without zone; compare it as an instant.
      AND (d."createdAt" AT TIME ZONE 'UTC') < d."remindAt"
      AND NOT EXISTS (
        SELECT 1 FROM "WorkoutSession" ws
        WHERE ws."userProgramId" = d."userProgramId"
          AND ws."weekNumber" = d."weekNumber"
          AND ws."dayNumber" = d."dayNumber"
      )
      AND NOT EXISTS (SELECT 1 FROM "Notification" n WHERE n."dedupeKey" = 'reminder:' || d."id")
      -- Switched off means not created at all, not just unpushed.
      AND NOT EXISTS (
        SELECT 1 FROM "NotificationPreference" np
        WHERE np."userId" = d."userId" AND np."type" = 'WORKOUT_REMINDER' AND np."pushEnabled" = false
      )
    ORDER BY d."id"
    LIMIT ${SWEEP.batch}`
}

async function queueUnfinishedReminders(now: Date): Promise<string[]> {
  const startedAt = { lte: new Date(now.getTime() - SWEEP.unfinishedAfterMs), gt: new Date(now.getTime() - SWEEP.unfinishedLookbackMs) }
  const noReminderYet = { none: { type: 'WORKOUT_UNFINISHED' as const } }
  // For workout reminders, switched off means not created at all, not just
  // unpushed as for social types: an inbox entry would still be a reminder.
  const notSwitchedOff = { notificationPreferences: { none: { type: 'WORKOUT_UNFINISHED' as const, pushEnabled: false } } }
  const page = { select: { id: true, userId: true }, orderBy: { startedAt: 'asc' as const }, take: SWEEP.batch }

  const [program, standalone] = await Promise.all([
    prisma.workoutSession.findMany({
      where: {
        status: 'IN_PROGRESS',
        startedAt,
        userProgram: { completedAt: null, archivedAt: null },
        notifications: noReminderYet,
        user: notSwitchedOff,
      },
      ...page,
    }),
    prisma.standaloneWorkoutSession.findMany({
      where: { status: 'IN_PROGRESS', startedAt, notifications: noReminderYet, user: notSwitchedOff },
      ...page,
    }),
  ])

  return notifySystem(prisma, [
    ...program.map((s) => ({
      recipientId: s.userId,
      type: 'WORKOUT_UNFINISHED' as const,
      dedupeKey: notificationKeys.unfinished(s.id),
      target: { workoutSessionId: s.id },
    })),
    ...standalone.map((s) => ({
      recipientId: s.userId,
      type: 'WORKOUT_UNFINISHED' as const,
      dedupeKey: notificationKeys.unfinished(s.id),
      target: { standaloneSessionId: s.id },
    })),
  ])
}

async function queueScheduledReminders(now: Date): Promise<string[]> {
  const due = await dueReminders(now)
  return notifySystem(prisma, due.map((r) => ({
    recipientId: r.userId,
    type: 'WORKOUT_REMINDER' as const,
    dedupeKey: notificationKeys.reminder(r.id),
    target: { scheduledWorkoutId: r.id },
    data: { programName: r.programName, weekNumber: r.weekNumber, dayNumber: r.dayNumber, day: r.isToday ? 'today' : 'tomorrow' },
  })))
}

/** Backstop for the complete routes: a reminder whose session is no longer in progress is moot. */
async function dismissStaleUnfinished(now: Date): Promise<number> {
  const { count } = await prisma.notification.updateMany({
    where: {
      type: 'WORKOUT_UNFINISHED',
      dismissedAt: null,
      OR: [
        { workoutSession: { is: { status: { not: 'IN_PROGRESS' } } } },
        { standaloneSession: { is: { status: { not: 'IN_PROGRESS' } } } },
      ],
    },
    data: { dismissedAt: now },
  })
  return count
}

async function undeliveredPushes(now: Date): Promise<string[]> {
  const rows = await prisma.notification.findMany({
    where: {
      pushedAt: null,
      pushAttempts: { lt: SWEEP.maxPushAttempts },
      createdAt: { lte: new Date(now.getTime() - SWEEP.retryMinAgeMs), gt: new Date(now.getTime() - SWEEP.retryMaxAgeMs) },
      readAt: null,
      dismissedAt: null,
    },
    select: { dedupeKey: true },
    orderBy: { createdAt: 'asc' },
    take: SWEEP.retryBatch,
  })
  return rows.map((r) => r.dedupeKey)
}

async function purgeOld(now: Date): Promise<number> {
  const dismissed = await prisma.notification.deleteMany({ where: { dismissedAt: { lt: new Date(now.getTime() - SWEEP.dismissedRetentionMs) } } })
  const expired = await prisma.notification.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - SWEEP.retentionMs) } } })
  return dismissed.count + expired.count
}

/**
 * Pushes in chunks of `pushConcurrency`, starting no new chunk after
 * `deadline` (epoch ms). deliverPush never throws, so this only bounds how
 * many APNs requests are open at once and how long a run takes.
 */
export async function deliverAll(keys: string[], deadline: number): Promise<{ pushes: Record<DeliveryOutcome, number>; deferred: number }> {
  const pushes: Record<DeliveryOutcome, number> = { sent: 0, no_device: 0, failed: 0, skipped: 0 }
  for (let i = 0; i < keys.length; i += SWEEP.pushConcurrency) {
    if (Date.now() > deadline) return { pushes, deferred: keys.length - i }
    const outcomes = await Promise.all(keys.slice(i, i + SWEEP.pushConcurrency).map((k) => deliverPush(k)))
    for (const outcome of outcomes) pushes[outcome]++
  }
  return { pushes, deferred: 0 }
}

/** Runs every step; see the module comment. Never throws — check `failedSteps`. */
export async function runNotificationSweep(now: Date = new Date()): Promise<SweepSummary> {
  const started = Date.now()
  const failedSteps: string[] = []
  async function step<T>(name: string, fallback: T, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      logger.error({ err, step: name }, '[notifications.sweep] Step failed')
      failedSteps.push(name)
      return fallback
    }
  }

  const staleDismissed = await step('dismiss-stale', 0, () => dismissStaleUnfinished(now))
  const unfinished = await step('unfinished', [] as string[], () => queueUnfinishedReminders(now))
  const reminders = await step('reminders', [] as string[], () => queueScheduledReminders(now))
  // Rows created above are newer than retryMinAgeMs, so they can't be picked twice.
  const retries = await step('retry-query', [] as string[], () => undeliveredPushes(now))
  const { pushes, deferred } = await deliverAll([...unfinished, ...reminders, ...retries], started + SWEEP.pushBudgetMs)
  const purged = await step('purge', 0, () => purgeOld(now))

  const summary: SweepSummary = {
    unfinished: unfinished.length,
    reminders: reminders.length,
    staleDismissed,
    retried: retries.length,
    pushes,
    deferred,
    purged,
    failedSteps,
    durationMs: Date.now() - started,
  }
  logger.info(summary, 'notifications.sweep')
  return summary
}

/**
 * Constant-time check of `Authorization: Bearer <secret>`. Both sides are
 * hashed first so timingSafeEqual always compares equal-length buffers and the
 * secret's length isn't leaked either. An unset secret authorizes nothing.
 */
export function isAuthorizedCronRequest(header: string | undefined, secret: string): boolean {
  if (!secret || !header?.startsWith('Bearer ')) return false
  const digest = (s: string) => createHash('sha256').update(s).digest()
  return timingSafeEqual(digest(header.slice('Bearer '.length)), digest(secret))
}
