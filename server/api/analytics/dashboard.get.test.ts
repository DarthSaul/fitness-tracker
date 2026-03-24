import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './dashboard.get'

const mockFindManySessions = (prisma as typeof prisma).workoutSession.findMany as ReturnType<typeof vi.fn>
const mockFindManyCompletedSets = (prisma as typeof prisma).completedSet.findMany as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent() {
  return {
    path: '/api/analytics/dashboard',
    context: { userId: 'user001' },
  }
}

const now = new Date('2026-03-24T12:00:00.000Z')

function makeSession(overrides: Partial<{
  id: string
  completedAt: Date | null
  completedSets: { reps: number | null; weight: number | null }[]
}> = {}) {
  return {
    id: 'ws001',
    userId: 'user001',
    userProgramId: 'up001',
    weekNumber: 1,
    dayNumber: 1,
    status: 'COMPLETED',
    startedAt: new Date('2026-03-24T10:00:00.000Z'),
    completedAt: now,
    completedSets: [
      { reps: 10, weight: 135 },
      { reps: 8, weight: 155 },
    ],
    ...overrides,
  }
}

describe('GET /api/analytics/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('returns correct shape with all fields when sessions exist', async () => {
    const sessions = [makeSession({ id: 'ws001', completedAt: now })]
    mockFindManySessions.mockResolvedValueOnce(sessions)
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{
      totalSessions: number
      totalVolumeLbs: number
      currentStreakDays: number
      longestStreakDays: number
      lastWorkoutAt: string | null
      totalExercises: number
    }>)(event)

    expect(result).toHaveProperty('totalSessions')
    expect(result).toHaveProperty('totalVolumeLbs')
    expect(result).toHaveProperty('currentStreakDays')
    expect(result).toHaveProperty('longestStreakDays')
    expect(result).toHaveProperty('lastWorkoutAt')
    expect(result).toHaveProperty('totalExercises')
  })

  test('totalSessions counts only COMPLETED sessions', async () => {
    // The route queries with status: 'COMPLETED' — so the DB filter handles this.
    // We verify the query uses that filter.
    mockFindManySessions.mockResolvedValueOnce([])
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockFindManySessions).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user001', status: 'COMPLETED' },
      }),
    )
  })

  test('totalSessions is the count of returned COMPLETED sessions', async () => {
    const sessions = [
      makeSession({ id: 'ws001', completedAt: new Date('2026-03-22T12:00:00.000Z') }),
      makeSession({ id: 'ws002', completedAt: new Date('2026-03-23T12:00:00.000Z') }),
      makeSession({ id: 'ws003', completedAt: new Date('2026-03-24T12:00:00.000Z') }),
    ]
    mockFindManySessions.mockResolvedValueOnce(sessions)
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ totalSessions: number }>)(event)

    expect(result.totalSessions).toBe(3)
  })

  test('totalVolumeLbs correctly sums reps × weight across all sets', async () => {
    // 10 × 135 = 1350, 8 × 155 = 1240 → total 2590
    const sessions = [makeSession({
      completedSets: [
        { reps: 10, weight: 135 },
        { reps: 8, weight: 155 },
      ],
    })]
    mockFindManySessions.mockResolvedValueOnce(sessions)
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ totalVolumeLbs: number }>)(event)

    expect(result.totalVolumeLbs).toBe(2590)
  })

  test('totalVolumeLbs skips sets where reps is null', async () => {
    const sessions = [makeSession({
      completedSets: [
        { reps: null, weight: 135 },
        { reps: 10, weight: 100 },
      ],
    })]
    mockFindManySessions.mockResolvedValueOnce(sessions)
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ totalVolumeLbs: number }>)(event)

    expect(result.totalVolumeLbs).toBe(1000)
  })

  test('totalVolumeLbs skips sets where weight is null', async () => {
    const sessions = [makeSession({
      completedSets: [
        { reps: 10, weight: null },
        { reps: 5, weight: 200 },
      ],
    })]
    mockFindManySessions.mockResolvedValueOnce(sessions)
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ totalVolumeLbs: number }>)(event)

    expect(result.totalVolumeLbs).toBe(1000)
  })

  test('totalVolumeLbs is 0 when all sets have null reps and weight', async () => {
    const sessions = [makeSession({ completedSets: [{ reps: null, weight: null }] })]
    mockFindManySessions.mockResolvedValueOnce(sessions)
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ totalVolumeLbs: number }>)(event)

    expect(result.totalVolumeLbs).toBe(0)
  })

  test('currentStreakDays is 0 when no sessions exist', async () => {
    mockFindManySessions.mockResolvedValueOnce([])
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ currentStreakDays: number }>)(event)

    expect(result.currentStreakDays).toBe(0)
  })

  test('longestStreakDays is 0 when no sessions exist', async () => {
    mockFindManySessions.mockResolvedValueOnce([])
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ longestStreakDays: number }>)(event)

    expect(result.longestStreakDays).toBe(0)
  })

  test('lastWorkoutAt is null when no sessions exist', async () => {
    mockFindManySessions.mockResolvedValueOnce([])
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ lastWorkoutAt: string | null }>)(event)

    expect(result.lastWorkoutAt).toBeNull()
  })

  test('lastWorkoutAt is the ISO string of the most recent session completedAt', async () => {
    const completedAt = new Date('2026-03-24T15:30:00.000Z')
    const sessions = [
      makeSession({ id: 'ws001', completedAt: new Date('2026-03-20T12:00:00.000Z') }),
      makeSession({ id: 'ws002', completedAt }),
    ]
    mockFindManySessions.mockResolvedValueOnce(sessions)
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ lastWorkoutAt: string | null }>)(event)

    expect(result.lastWorkoutAt).toBe(completedAt.toISOString())
  })

  test('lastWorkoutAt is null when last session completedAt is null', async () => {
    const sessions = [makeSession({ completedAt: null })]
    mockFindManySessions.mockResolvedValueOnce(sessions)
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ lastWorkoutAt: string | null }>)(event)

    expect(result.lastWorkoutAt).toBeNull()
  })

  test('totalExercises counts distinct exercises via completedSet query', async () => {
    mockFindManySessions.mockResolvedValueOnce([makeSession()])
    // Two sets for same exercise (ex001) and one for a different exercise (ex002)
    mockFindManyCompletedSets.mockResolvedValueOnce([
      { exerciseSet: { programExercise: { exerciseId: 'ex001' } } },
      { exerciseSet: { programExercise: { exerciseId: 'ex001' } } },
      { exerciseSet: { programExercise: { exerciseId: 'ex002' } } },
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ totalExercises: number }>)(event)

    expect(result.totalExercises).toBe(2)
  })

  test('totalExercises is 0 when no completed sets exist', async () => {
    mockFindManySessions.mockResolvedValueOnce([])
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ totalExercises: number }>)(event)

    expect(result.totalExercises).toBe(0)
  })

  test('completedSet query filters by COMPLETED session status', async () => {
    mockFindManySessions.mockResolvedValueOnce([])
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockFindManyCompletedSets).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workoutSession: { userId: 'user001', status: 'COMPLETED' } },
      }),
    )
  })

  test('currentStreakDays is 1 when only today has a session', async () => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const todayDate = new Date(`${todayStr}T10:00:00.000Z`)
    const sessions = [makeSession({ completedAt: todayDate })]
    mockFindManySessions.mockResolvedValueOnce(sessions)
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ currentStreakDays: number }>)(event)

    expect(result.currentStreakDays).toBe(1)
  })

  test('currentStreakDays counts consecutive days ending today', async () => {
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const makeDay = (daysAgo: number) => {
      const d = new Date(`${todayStr}T10:00:00.000Z`)
      d.setUTCDate(d.getUTCDate() - daysAgo)
      return d
    }
    const sessions = [
      makeSession({ id: 'ws001', completedAt: makeDay(2) }),
      makeSession({ id: 'ws002', completedAt: makeDay(1) }),
      makeSession({ id: 'ws003', completedAt: makeDay(0) }),
    ]
    mockFindManySessions.mockResolvedValueOnce(sessions)
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ currentStreakDays: number }>)(event)

    expect(result.currentStreakDays).toBe(3)
  })

  test('currentStreakDays is 0 when last session was more than one day ago', async () => {
    const threeDaysAgo = new Date('2026-03-21T10:00:00.000Z')
    const sessions = [makeSession({ completedAt: threeDaysAgo })]
    mockFindManySessions.mockResolvedValueOnce(sessions)
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ currentStreakDays: number }>)(event)

    expect(result.currentStreakDays).toBe(0)
  })

  test('longestStreakDays counts the longest run of consecutive days', async () => {
    // Sessions on: Mar 10, 11, 12 (3-day streak) — then gap — Mar 20, 21 (2-day streak)
    const sessions = [
      makeSession({ id: 'ws001', completedAt: new Date('2026-03-10T10:00:00.000Z') }),
      makeSession({ id: 'ws002', completedAt: new Date('2026-03-11T10:00:00.000Z') }),
      makeSession({ id: 'ws003', completedAt: new Date('2026-03-12T10:00:00.000Z') }),
      makeSession({ id: 'ws004', completedAt: new Date('2026-03-20T10:00:00.000Z') }),
      makeSession({ id: 'ws005', completedAt: new Date('2026-03-21T10:00:00.000Z') }),
    ]
    mockFindManySessions.mockResolvedValueOnce(sessions)
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ longestStreakDays: number }>)(event)

    expect(result.longestStreakDays).toBe(3)
  })

  test('deduplicates same-day sessions for streak computation', async () => {
    // Two sessions on same day should count as 1 day in the streak
    const sameDay = new Date('2026-03-23T10:00:00.000Z')
    const nextDay = new Date('2026-03-24T10:00:00.000Z')
    const sessions = [
      makeSession({ id: 'ws001', completedAt: sameDay }),
      makeSession({ id: 'ws002', completedAt: sameDay }),
      makeSession({ id: 'ws003', completedAt: nextDay }),
    ]
    mockFindManySessions.mockResolvedValueOnce(sessions)
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ longestStreakDays: number }>)(event)

    expect(result.longestStreakDays).toBe(2)
  })

  test('throws 500 and logs error when workoutSession.findMany fails', async () => {
    const dbError = new Error('connection reset')
    mockFindManySessions.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch dashboard stats' })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[GET /api/analytics/dashboard] Failed to fetch dashboard stats',
      dbError,
    )
    consoleSpy.mockRestore()
  })

  test('throws 500 and logs error when completedSet.findMany fails', async () => {
    mockFindManySessions.mockResolvedValueOnce([makeSession()])
    const dbError = new Error('query timeout')
    mockFindManyCompletedSets.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch dashboard stats' })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[GET /api/analytics/dashboard] Failed to fetch dashboard stats',
      dbError,
    )
    consoleSpy.mockRestore()
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('Unauthorized') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 401
    h3Error.statusMessage = 'Unauthorized'
    mockFindManySessions.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(401)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
