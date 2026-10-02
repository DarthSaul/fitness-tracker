import { describe, test, expect, vi, beforeEach } from 'vitest'

import { runNotificationSweep, isAuthorizedCronRequest, deliverAll, SWEEP } from './notification-sweep'

const db = prisma as unknown as {
  $queryRaw: ReturnType<typeof vi.fn>
  workoutSession: { findMany: ReturnType<typeof vi.fn> }
  standaloneWorkoutSession: { findMany: ReturnType<typeof vi.fn> }
  notification: Record<string, ReturnType<typeof vi.fn>>
}
const mockNotifySystem = notifySystem as ReturnType<typeof vi.fn>
const mockDeliverPush = deliverPush as ReturnType<typeof vi.fn>

const NOW = new Date('2026-10-02T18:00:00.000Z')
const HOUR = 60 * 60 * 1000

describe('runNotificationSweep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.workoutSession.findMany.mockResolvedValue([])
    db.standaloneWorkoutSession.findMany.mockResolvedValue([])
    db.$queryRaw.mockResolvedValue([])
    db.notification.updateMany!.mockResolvedValue({ count: 0 })
    db.notification.findMany!.mockResolvedValue([])
    db.notification.deleteMany!.mockResolvedValue({ count: 0 })
    mockNotifySystem.mockResolvedValue([])
    mockDeliverPush.mockResolvedValue('sent')
  })

  describe('unfinished workouts', () => {
    const window = { lte: new Date(NOW.getTime() - 4 * HOUR), gt: new Date(NOW.getTime() - 48 * HOUR) }

    test('finds IN_PROGRESS program and standalone sessions started 4–48 h ago with no reminder yet', async () => {
      await runNotificationSweep(NOW)

      expect(db.workoutSession.findMany).toHaveBeenCalledWith({
        where: {
          status: 'IN_PROGRESS',
          startedAt: window,
          // A finished or archived run is history; its leftovers aren't nagged about.
          userProgram: { completedAt: null, archivedAt: null },
          notifications: { none: { type: 'WORKOUT_UNFINISHED' } },
        },
        select: { id: true, userId: true },
        orderBy: { startedAt: 'asc' },
        take: SWEEP.batch,
      })
      expect(db.standaloneWorkoutSession.findMany).toHaveBeenCalledWith({
        where: { status: 'IN_PROGRESS', startedAt: window, notifications: { none: { type: 'WORKOUT_UNFINISHED' } } },
        select: { id: true, userId: true },
        orderBy: { startedAt: 'asc' },
        take: SWEEP.batch,
      })
    })

    test('queues one reminder per session, deep-linking to the right kind', async () => {
      db.workoutSession.findMany.mockResolvedValueOnce([{ id: 'ws1', userId: 'u1' }])
      db.standaloneWorkoutSession.findMany.mockResolvedValueOnce([{ id: 'ss1', userId: 'u2' }])

      await runNotificationSweep(NOW)

      expect(mockNotifySystem).toHaveBeenCalledWith(prisma, [
        { recipientId: 'u1', type: 'WORKOUT_UNFINISHED', dedupeKey: 'unfinished:ws1', target: { workoutSessionId: 'ws1' } },
        { recipientId: 'u2', type: 'WORKOUT_UNFINISHED', dedupeKey: 'unfinished:ss1', target: { standaloneSessionId: 'ss1' } },
      ])
    })

    test('dismisses reminders whose session is no longer in progress (backstop for the complete routes)', async () => {
      db.notification.updateMany!.mockResolvedValueOnce({ count: 2 })

      const summary = await runNotificationSweep(NOW)

      expect(db.notification.updateMany).toHaveBeenCalledWith({
        where: {
          type: 'WORKOUT_UNFINISHED',
          dismissedAt: null,
          OR: [
            { workoutSession: { is: { status: { not: 'IN_PROGRESS' } } } },
            { standaloneSession: { is: { status: { not: 'IN_PROGRESS' } } } },
          ],
        },
        data: { dismissedAt: NOW },
      })
      expect(summary.staleDismissed).toBe(2)
    })
  })

  describe('scheduled-workout reminders', () => {
    test('queues a reminder per due workout, with the program snapshot', async () => {
      db.$queryRaw.mockResolvedValueOnce([
        { id: 'sw1', userId: 'u1', weekNumber: 2, dayNumber: 3, programName: 'Arm Farm' },
      ])

      await runNotificationSweep(NOW)

      // The SQL is tagged-template: `now` is bound as a parameter, never interpolated.
      const [strings, ...values] = db.$queryRaw.mock.calls[0]!
      expect(strings.join('?')).toContain('pg_timezone_names')
      expect(values).toContain(NOW)
      expect(mockNotifySystem).toHaveBeenCalledWith(prisma, [{
        recipientId: 'u1',
        type: 'WORKOUT_REMINDER',
        dedupeKey: 'reminder:sw1',
        target: { scheduledWorkoutId: 'sw1' },
        data: { programName: 'Arm Farm', weekNumber: 2, dayNumber: 3 },
      }])
    })
  })

  describe('push delivery', () => {
    test('pushes every newly created notification plus undelivered ones due a retry', async () => {
      mockNotifySystem.mockResolvedValueOnce(['unfinished:ws1']).mockResolvedValueOnce(['reminder:sw1'])
      db.notification.findMany!.mockResolvedValueOnce([{ dedupeKey: 'reaction:p1:a' }])
      mockDeliverPush.mockResolvedValueOnce('sent').mockResolvedValueOnce('no_device').mockResolvedValueOnce('failed')

      const summary = await runNotificationSweep(NOW)

      expect(db.notification.findMany).toHaveBeenCalledWith({
        where: {
          pushedAt: null,
          pushAttempts: { lt: SWEEP.maxPushAttempts },
          // Old enough that the request's own waitUntil push has had its chance.
          createdAt: { lte: new Date(NOW.getTime() - SWEEP.retryMinAgeMs), gt: new Date(NOW.getTime() - SWEEP.retryMaxAgeMs) },
          readAt: null,
          dismissedAt: null,
        },
        select: { dedupeKey: true },
        orderBy: { createdAt: 'asc' },
        take: SWEEP.retryBatch,
      })
      expect(mockDeliverPush.mock.calls.map((c) => c[0]).sort()).toEqual(['reaction:p1:a', 'reminder:sw1', 'unfinished:ws1'])
      expect(summary).toMatchObject({ unfinished: 1, reminders: 1, retried: 1, pushes: { sent: 1, no_device: 1, failed: 1, skipped: 0 } })
    })

    test('limits concurrent pushes', async () => {
      mockNotifySystem.mockResolvedValueOnce(Array.from({ length: 25 }, (_, i) => `unfinished:s${i}`))
      let inFlight = 0
      let peak = 0
      mockDeliverPush.mockImplementation(async () => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await Promise.resolve()
        inFlight--
        return 'sent'
      })

      await runNotificationSweep(NOW)

      expect(mockDeliverPush).toHaveBeenCalledTimes(25)
      expect(peak).toBeLessThanOrEqual(SWEEP.pushConcurrency)
    })
  })

  describe('time budget', () => {
    test('stops starting pushes once the deadline passes; the rest are left for the retry step', async () => {
      const keys = Array.from({ length: 25 }, (_, i) => `k${i}`)
      const clock = vi.spyOn(Date, 'now')
      // First chunk starts in time; by the second check the deadline has passed.
      clock.mockReturnValueOnce(0).mockReturnValue(10_000)

      const { pushes, deferred } = await deliverAll(keys, 5_000)

      expect(mockDeliverPush).toHaveBeenCalledTimes(SWEEP.pushConcurrency)
      expect(pushes.sent).toBe(SWEEP.pushConcurrency)
      expect(deferred).toBe(25 - SWEEP.pushConcurrency)
      clock.mockRestore()
    })

    test('the summary reports deferred pushes', async () => {
      const summary = await runNotificationSweep(NOW)
      expect(summary.deferred).toBe(0)
    })
  })

  describe('retention', () => {
    test('deletes dismissed notifications after 30 days and everything after 90', async () => {
      db.notification.deleteMany!.mockResolvedValueOnce({ count: 3 }).mockResolvedValueOnce({ count: 4 })

      const summary = await runNotificationSweep(NOW)

      expect(db.notification.deleteMany).toHaveBeenCalledWith({ where: { dismissedAt: { lt: new Date(NOW.getTime() - 30 * 24 * HOUR) } } })
      expect(db.notification.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date(NOW.getTime() - 90 * 24 * HOUR) } } })
      expect(summary.purged).toBe(7)
    })
  })

  describe('failure isolation and logging', () => {
    test('a failing step is logged and reported, and the other steps still run', async () => {
      const err = new Error('time zone "Mars/Olympus" not recognized')
      db.$queryRaw.mockRejectedValueOnce(err)
      db.workoutSession.findMany.mockResolvedValueOnce([{ id: 'ws1', userId: 'u1' }])

      const summary = await runNotificationSweep(NOW)

      expect(summary.failedSteps).toEqual(['reminders'])
      expect(logger.error).toHaveBeenCalledWith({ err, step: 'reminders' }, '[notifications.sweep] Step failed')
      expect(mockNotifySystem).toHaveBeenCalled()
      expect(db.notification.deleteMany).toHaveBeenCalled()
    })

    test('logs one notifications.sweep line with the counts', async () => {
      await runNotificationSweep(NOW)
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ unfinished: 0, reminders: 0, retried: 0, purged: 0, failedSteps: [], durationMs: expect.any(Number) }),
        'notifications.sweep',
      )
    })
  })
})

describe('isAuthorizedCronRequest', () => {
  const secret = 'a'.repeat(64)

  test('accepts exactly `Bearer <secret>`', () => {
    expect(isAuthorizedCronRequest(`Bearer ${secret}`, secret)).toBe(true)
  })

  test.each([
    ['missing header', undefined],
    ['wrong secret', `Bearer ${'b'.repeat(64)}`],
    ['a prefix of the secret', `Bearer ${secret.slice(0, 10)}`],
    ['no Bearer scheme', secret],
    ['empty bearer', 'Bearer '],
  ])('rejects %s', (_label, header) => {
    expect(isAuthorizedCronRequest(header, secret)).toBe(false)
  })

  test('rejects everything when no secret is configured', () => {
    expect(isAuthorizedCronRequest('Bearer ', '')).toBe(false)
  })
})
