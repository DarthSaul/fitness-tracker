import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './dashboard.get'

const mockFindManySessions = (prisma as typeof prisma).workoutSession.findMany as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent() {
  return {
    path: '/api/analytics/dashboard',
    context: { userId: 'user001' },
  }
}

const now = new Date('2026-03-24T12:00:00.000Z')

/** Build a single completed-set mock with the exerciseSet chain the route traverses. */
function makeSet(overrides: {
  reps?: number | null
  weight?: number | null
  exerciseId?: string
} = {}) {
  return {
    reps: overrides.reps !== undefined ? overrides.reps : 10,
    weight: overrides.weight !== undefined ? overrides.weight : 135,
    exerciseSet: { programExercise: { exerciseId: overrides.exerciseId ?? 'ex001' } },
  }
}

function makeSession(overrides: Partial<{
  id: string
  completedAt: Date | null
  completedSets: ReturnType<typeof makeSet>[]
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
    completedSets: [makeSet(), makeSet({ reps: 8, weight: 155 })],
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
    mockFindManySessions.mockResolvedValueOnce([makeSession()])

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
    mockFindManySessions.mockResolvedValueOnce([])

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

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ totalSessions: number }>)(event)

    expect(result.totalSessions).toBe(3)
  })

  test('totalVolumeLbs correctly sums reps × weight across all sets', async () => {
    // 10 × 135 = 1350, 8 × 155 = 1240 → total 2590
    mockFindManySessions.mockResolvedValueOnce([makeSession({
      completedSets: [makeSet({ reps: 10, weight: 135 }), makeSet({ reps: 8, weight: 155 })],
    })])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ totalVolumeLbs: number }>)(event)

    expect(result.totalVolumeLbs).toBe(2590)
  })

  test('totalVolumeLbs skips sets where reps is null', async () => {
    mockFindManySessions.mockResolvedValueOnce([makeSession({
      completedSets: [makeSet({ reps: null, weight: 135 }), makeSet({ reps: 10, weight: 100 })],
    })])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ totalVolumeLbs: number }>)(event)

    expect(result.totalVolumeLbs).toBe(1000)
  })

  test('totalVolumeLbs skips sets where weight is null', async () => {
    mockFindManySessions.mockResolvedValueOnce([makeSession({
      completedSets: [makeSet({ reps: 10, weight: null }), makeSet({ reps: 5, weight: 200 })],
    })])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ totalVolumeLbs: number }>)(event)

    expect(result.totalVolumeLbs).toBe(1000)
  })

  test('totalVolumeLbs is 0 when all sets have null reps and weight', async () => {
    mockFindManySessions.mockResolvedValueOnce([makeSession({
      completedSets: [makeSet({ reps: null, weight: null })],
    })])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ totalVolumeLbs: number }>)(event)

    expect(result.totalVolumeLbs).toBe(0)
  })

  test('currentStreakDays is 0 when no sessions exist', async () => {
    mockFindManySessions.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ currentStreakDays: number }>)(event)

    expect(result.currentStreakDays).toBe(0)
  })

  test('longestStreakDays is 0 when no sessions exist', async () => {
    mockFindManySessions.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ longestStreakDays: number }>)(event)

    expect(result.longestStreakDays).toBe(0)
  })

  test('lastWorkoutAt is null when no sessions exist', async () => {
    mockFindManySessions.mockResolvedValueOnce([])

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

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ lastWorkoutAt: string | null }>)(event)

    expect(result.lastWorkoutAt).toBe(completedAt.toISOString())
  })

  test('lastWorkoutAt is null when last session completedAt is null', async () => {
    mockFindManySessions.mockResolvedValueOnce([makeSession({ completedAt: null })])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ lastWorkoutAt: string | null }>)(event)

    expect(result.lastWorkoutAt).toBeNull()
  })

  test('lastWorkoutAt returns most recent non-null completedAt when last session has null completedAt', async () => {
    // The final session (by ascending sort) has null completedAt — lastWorkoutAt must use the earlier non-null date
    const nonNullDate = new Date('2026-03-22T12:00:00.000Z')
    mockFindManySessions.mockResolvedValueOnce([
      makeSession({ id: 'ws001', completedAt: nonNullDate }),
      makeSession({ id: 'ws002', completedAt: null }),
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ lastWorkoutAt: string | null }>)(event)

    expect(result.lastWorkoutAt).toBe(nonNullDate.toISOString())
  })

  test('totalExercises counts distinct exercises from session completedSets', async () => {
    // Two sets for same exercise (ex001) across two sessions + one for a different exercise (ex002)
    mockFindManySessions.mockResolvedValueOnce([
      makeSession({ id: 'ws001', completedSets: [makeSet({ exerciseId: 'ex001' }), makeSet({ exerciseId: 'ex001' })] }),
      makeSession({ id: 'ws002', completedSets: [makeSet({ exerciseId: 'ex002' })] }),
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ totalExercises: number }>)(event)

    expect(result.totalExercises).toBe(2)
  })

  test('totalExercises is 0 when no completed sets exist', async () => {
    mockFindManySessions.mockResolvedValueOnce([makeSession({ completedSets: [] })])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ totalExercises: number }>)(event)

    expect(result.totalExercises).toBe(0)
  })

  test('currentStreakDays is 1 when only today has a session', async () => {
    const fixedNow = new Date('2026-03-24T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(fixedNow)

    mockFindManySessions.mockResolvedValueOnce([makeSession({ completedAt: fixedNow })])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ currentStreakDays: number }>)(event)

    vi.useRealTimers()
    expect(result.currentStreakDays).toBe(1)
  })

  test('currentStreakDays counts consecutive days ending today', async () => {
    const fixedNow = new Date('2026-03-24T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(fixedNow)

    const makeDay = (daysAgo: number) => {
      const d = new Date('2026-03-24T10:00:00.000Z')
      d.setUTCDate(d.getUTCDate() - daysAgo)
      return d
    }
    mockFindManySessions.mockResolvedValueOnce([
      makeSession({ id: 'ws001', completedAt: makeDay(2) }),
      makeSession({ id: 'ws002', completedAt: makeDay(1) }),
      makeSession({ id: 'ws003', completedAt: makeDay(0) }),
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ currentStreakDays: number }>)(event)

    vi.useRealTimers()
    expect(result.currentStreakDays).toBe(3)
  })

  test('currentStreakDays is 0 when last session was more than one day ago', async () => {
    const fixedNow = new Date('2026-03-24T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(fixedNow)

    mockFindManySessions.mockResolvedValueOnce([makeSession({ completedAt: new Date('2026-03-21T10:00:00.000Z') })])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ currentStreakDays: number }>)(event)

    vi.useRealTimers()
    expect(result.currentStreakDays).toBe(0)
  })

  test('longestStreakDays counts the longest run of consecutive days', async () => {
    // Sessions on: Mar 10, 11, 12 (3-day streak) — then gap — Mar 20, 21 (2-day streak)
    mockFindManySessions.mockResolvedValueOnce([
      makeSession({ id: 'ws001', completedAt: new Date('2026-03-10T10:00:00.000Z') }),
      makeSession({ id: 'ws002', completedAt: new Date('2026-03-11T10:00:00.000Z') }),
      makeSession({ id: 'ws003', completedAt: new Date('2026-03-12T10:00:00.000Z') }),
      makeSession({ id: 'ws004', completedAt: new Date('2026-03-20T10:00:00.000Z') }),
      makeSession({ id: 'ws005', completedAt: new Date('2026-03-21T10:00:00.000Z') }),
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ longestStreakDays: number }>)(event)

    expect(result.longestStreakDays).toBe(3)
  })

  test('deduplicates same-day sessions for streak computation', async () => {
    // Two sessions on same day should count as 1 day in the streak
    const sameDay = new Date('2026-03-23T10:00:00.000Z')
    const nextDay = new Date('2026-03-24T10:00:00.000Z')
    mockFindManySessions.mockResolvedValueOnce([
      makeSession({ id: 'ws001', completedAt: sameDay }),
      makeSession({ id: 'ws002', completedAt: sameDay }),
      makeSession({ id: 'ws003', completedAt: nextDay }),
    ])

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
