import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[exerciseId].get'

// prisma.exercise is not in the global stub — cast through any to access it.
// NOTE: vitest.setup.ts will need `exercise: { findUnique: vi.fn() }` added to
// the prisma global stub for this to work at runtime.
const mockFindUniqueExercise = (prisma as unknown as { exercise: { findUnique: ReturnType<typeof vi.fn> } }).exercise.findUnique as ReturnType<typeof vi.fn>
const mockFindManyCompletedSets = (prisma as typeof prisma).completedSet.findMany as ReturnType<typeof vi.fn>
const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(exerciseId = 'ex001') {
  mockGetRouterParam.mockReturnValue(exerciseId)
  return {
    path: `/api/analytics/exercises/${exerciseId}`,
    context: { userId: 'user001' },
  }
}

const mockExercise = { id: 'ex001', name: 'Bench Press' }

function makeCompletedSet(overrides: {
  id?: string
  reps?: number | null
  weight?: number | null
  workoutSessionId?: string
  completedAt?: Date
  weekNumber?: number
  dayNumber?: number
} = {}) {
  const {
    id = 'cs001',
    reps = 10,
    weight = 135,
    workoutSessionId = 'ws001',
    completedAt = new Date('2026-03-20T12:00:00.000Z'),
    weekNumber = 1,
    dayNumber = 1,
  } = overrides
  return {
    id,
    reps,
    weight,
    workoutSession: { id: workoutSessionId, completedAt, weekNumber, dayNumber },
  }
}

describe('GET /api/analytics/exercises/:exerciseId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('returns 400 when exerciseId param is missing', async () => {
    // Set the mock AFTER makeEvent so we override what makeEvent sets
    const event = { path: '/api/analytics/exercises/', context: { userId: 'user001' } }
    mockGetRouterParam.mockReturnValue(undefined)

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'exerciseId is required' })
  })

  test('returns 404 when exercise does not exist', async () => {
    mockFindUniqueExercise.mockResolvedValueOnce(null)

    const event = makeEvent('ex-missing')
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Exercise not found' })
  })

  test('returns exercise and empty history when no completed sessions exist for that exercise', async () => {
    mockFindUniqueExercise.mockResolvedValueOnce(mockExercise)
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{
      exercise: typeof mockExercise
      history: unknown[]
    }>)(event)

    expect(result.exercise).toEqual(mockExercise)
    expect(result.history).toEqual([])
  })

  test('returns correct history shape for a single session with one set', async () => {
    mockFindUniqueExercise.mockResolvedValueOnce(mockExercise)
    mockFindManyCompletedSets.mockResolvedValueOnce([
      makeCompletedSet({ reps: 10, weight: 135 }),
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{
      exercise: { id: string; name: string }
      history: {
        sessionId: string
        completedAt: string
        weekNumber: number
        dayNumber: number
        sets: { reps: number | null; weight: number | null; e1rm: number | null }[]
        bestE1rm: number | null
        totalVolume: number | null
      }[]
    }>)(event)

    expect(result.history).toHaveLength(1)
    const entry = result.history[0]!
    expect(entry.sessionId).toBe('ws001')
    expect(entry.weekNumber).toBe(1)
    expect(entry.dayNumber).toBe(1)
    expect(entry.sets).toHaveLength(1)
    expect(entry.sets[0]).toMatchObject({ reps: 10, weight: 135 })
  })

  test('history is ordered oldest to newest (ascending completedAt)', async () => {
    mockFindUniqueExercise.mockResolvedValueOnce(mockExercise)
    // Prisma returns them ordered asc already; the route preserves insertion order.
    mockFindManyCompletedSets.mockResolvedValueOnce([
      makeCompletedSet({ workoutSessionId: 'ws001', completedAt: new Date('2026-03-10T12:00:00.000Z') }),
      makeCompletedSet({ workoutSessionId: 'ws002', completedAt: new Date('2026-03-20T12:00:00.000Z') }),
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{
      history: { sessionId: string; completedAt: string }[]
    }>)(event)

    expect(result.history[0]!.sessionId).toBe('ws001')
    expect(result.history[1]!.sessionId).toBe('ws002')
    expect(result.history[0]!.completedAt < result.history[1]!.completedAt).toBe(true)
  })

  test('completedSets query filters by exerciseId and COMPLETED sessions', async () => {
    mockFindUniqueExercise.mockResolvedValueOnce(mockExercise)
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent('ex001')
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockFindManyCompletedSets).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workoutSession: { userId: 'user001', status: 'COMPLETED' },
          exerciseSet: { programExercise: { exerciseId: 'ex001' } },
        },
      }),
    )
  })

  test('e1RM is computed correctly using Epley formula: weight * (1 + reps / 30)', async () => {
    // 135 * (1 + 10 / 30) = 135 * 1.3333... = 180
    mockFindUniqueExercise.mockResolvedValueOnce(mockExercise)
    mockFindManyCompletedSets.mockResolvedValueOnce([
      makeCompletedSet({ reps: 10, weight: 135 }),
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{
      history: { sets: { e1rm: number | null }[] }[]
    }>)(event)

    const e1rm = result.history[0]!.sets[0]!.e1rm!
    expect(e1rm).toBeCloseTo(135 * (1 + 10 / 30))
  })

  test('e1RM is null when reps is null', async () => {
    mockFindUniqueExercise.mockResolvedValueOnce(mockExercise)
    mockFindManyCompletedSets.mockResolvedValueOnce([
      makeCompletedSet({ reps: null, weight: 135 }),
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{
      history: { sets: { e1rm: number | null }[] }[]
    }>)(event)

    expect(result.history[0]!.sets[0]!.e1rm).toBeNull()
  })

  test('e1RM is null when weight is null', async () => {
    mockFindUniqueExercise.mockResolvedValueOnce(mockExercise)
    mockFindManyCompletedSets.mockResolvedValueOnce([
      makeCompletedSet({ reps: 10, weight: null }),
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{
      history: { sets: { e1rm: number | null }[] }[]
    }>)(event)

    expect(result.history[0]!.sets[0]!.e1rm).toBeNull()
  })

  test('e1RM is null when reps is zero', async () => {
    mockFindUniqueExercise.mockResolvedValueOnce(mockExercise)
    mockFindManyCompletedSets.mockResolvedValueOnce([
      makeCompletedSet({ reps: 0, weight: 135 }),
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{
      history: { sets: { e1rm: number | null }[] }[]
    }>)(event)

    expect(result.history[0]!.sets[0]!.e1rm).toBeNull()
  })

  test('bestE1rm is the max e1RM across all sets in a session', async () => {
    // Set 1: 5 × 135 → e1rm = 135 * (1 + 5/30) = 157.5
    // Set 2: 10 × 135 → e1rm = 135 * (1 + 10/30) = 180
    // bestE1rm should be 180
    mockFindUniqueExercise.mockResolvedValueOnce(mockExercise)
    mockFindManyCompletedSets.mockResolvedValueOnce([
      makeCompletedSet({ id: 'cs001', reps: 5, weight: 135 }),
      makeCompletedSet({ id: 'cs002', reps: 10, weight: 135 }),
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{
      history: { bestE1rm: number | null }[]
    }>)(event)

    expect(result.history[0]!.bestE1rm).toBeCloseTo(135 * (1 + 10 / 30))
  })

  test('bestE1rm is null when all sets have null reps or weight', async () => {
    mockFindUniqueExercise.mockResolvedValueOnce(mockExercise)
    mockFindManyCompletedSets.mockResolvedValueOnce([
      makeCompletedSet({ reps: null, weight: null }),
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{
      history: { bestE1rm: number | null }[]
    }>)(event)

    expect(result.history[0]!.bestE1rm).toBeNull()
  })

  test('totalVolume sums reps × weight per session', async () => {
    // 10 × 135 = 1350, 8 × 155 = 1240 → 2590
    mockFindUniqueExercise.mockResolvedValueOnce(mockExercise)
    mockFindManyCompletedSets.mockResolvedValueOnce([
      makeCompletedSet({ id: 'cs001', reps: 10, weight: 135 }),
      makeCompletedSet({ id: 'cs002', reps: 8, weight: 155 }),
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{
      history: { totalVolume: number | null }[]
    }>)(event)

    expect(result.history[0]!.totalVolume).toBe(2590)
  })

  test('totalVolume is null when all sets have null reps and weight', async () => {
    mockFindUniqueExercise.mockResolvedValueOnce(mockExercise)
    mockFindManyCompletedSets.mockResolvedValueOnce([
      makeCompletedSet({ reps: null, weight: null }),
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{
      history: { totalVolume: number | null }[]
    }>)(event)

    expect(result.history[0]!.totalVolume).toBeNull()
  })

  test('totalVolume skips individual sets where reps or weight is null', async () => {
    // Set 1: null reps — skipped
    // Set 2: 10 × 100 = 1000
    mockFindUniqueExercise.mockResolvedValueOnce(mockExercise)
    mockFindManyCompletedSets.mockResolvedValueOnce([
      makeCompletedSet({ id: 'cs001', reps: null, weight: 135 }),
      makeCompletedSet({ id: 'cs002', reps: 10, weight: 100 }),
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{
      history: { totalVolume: number | null }[]
    }>)(event)

    expect(result.history[0]!.totalVolume).toBe(1000)
  })

  test('groups sets into separate history entries per session', async () => {
    mockFindUniqueExercise.mockResolvedValueOnce(mockExercise)
    mockFindManyCompletedSets.mockResolvedValueOnce([
      makeCompletedSet({ id: 'cs001', workoutSessionId: 'ws001', completedAt: new Date('2026-03-20T12:00:00.000Z') }),
      makeCompletedSet({ id: 'cs002', workoutSessionId: 'ws001', completedAt: new Date('2026-03-20T12:00:00.000Z') }),
      makeCompletedSet({ id: 'cs003', workoutSessionId: 'ws002', completedAt: new Date('2026-03-24T12:00:00.000Z') }),
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{
      history: { sessionId: string; sets: unknown[] }[]
    }>)(event)

    expect(result.history).toHaveLength(2)
    const ws001 = result.history.find((h) => h.sessionId === 'ws001')
    const ws002 = result.history.find((h) => h.sessionId === 'ws002')
    expect(ws001?.sets).toHaveLength(2)
    expect(ws002?.sets).toHaveLength(1)
  })

  test('throws 500 and logs error when exercise.findUnique fails', async () => {
    const dbError = new Error('connection reset')
    mockFindUniqueExercise.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent('ex001')
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch exercise history' })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[GET /api/analytics/exercises/ex001] Failed to fetch exercise history',
      dbError,
    )
    consoleSpy.mockRestore()
  })

  test('throws 500 and logs error when completedSet.findMany fails', async () => {
    mockFindUniqueExercise.mockResolvedValueOnce(mockExercise)
    const dbError = new Error('query timeout')
    mockFindManyCompletedSets.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent('ex001')
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch exercise history' })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[GET /api/analytics/exercises/ex001] Failed to fetch exercise history',
      dbError,
    )
    consoleSpy.mockRestore()
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('Exercise not found') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'Exercise not found'
    mockFindUniqueExercise.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(404)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
