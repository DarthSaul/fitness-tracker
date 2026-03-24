import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.get'

const mockFindManyCompletedSets = (prisma as typeof prisma).completedSet.findMany as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent() {
  return {
    path: '/api/analytics/exercises',
    context: { userId: 'user001' },
  }
}

function makeCompletedSet(overrides: {
  workoutSessionId?: string
  completedAt?: Date | null
  exerciseId?: string
  exerciseName?: string
} = {}) {
  const {
    workoutSessionId = 'ws001',
    completedAt = new Date('2026-03-24T12:00:00.000Z'),
    exerciseId = 'ex001',
    exerciseName = 'Bench Press',
  } = overrides
  return {
    id: `cs-${workoutSessionId}-${exerciseId}`,
    workoutSession: { id: workoutSessionId, completedAt },
    exerciseSet: {
      programExercise: {
        exercise: { id: exerciseId, name: exerciseName },
      },
    },
  }
}

describe('GET /api/analytics/exercises', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('returns empty array when no completed sessions exist', async () => {
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown[]>)(event)

    expect(result).toEqual([])
  })

  test('queries completedSets filtered by COMPLETED session status', async () => {
    mockFindManyCompletedSets.mockResolvedValueOnce([])

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockFindManyCompletedSets).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workoutSession: { userId: 'user001', status: 'COMPLETED' } },
      }),
    )
  })

  test('returns list of exercises with id, name, sessionCount, lastCompletedAt', async () => {
    mockFindManyCompletedSets.mockResolvedValueOnce([
      makeCompletedSet({ exerciseId: 'ex001', exerciseName: 'Bench Press' }),
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{
      id: string
      name: string
      sessionCount: number
      lastCompletedAt: string
    }[]>)(event)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'ex001',
      name: 'Bench Press',
      sessionCount: 1,
    })
    expect(typeof result[0]!.lastCompletedAt).toBe('string')
  })

  test('sessionCount counts distinct sessions not total sets', async () => {
    // Three sets across two distinct sessions for the same exercise
    mockFindManyCompletedSets.mockResolvedValueOnce([
      makeCompletedSet({ workoutSessionId: 'ws001', exerciseId: 'ex001' }),
      makeCompletedSet({ workoutSessionId: 'ws001', exerciseId: 'ex001' }),
      makeCompletedSet({ workoutSessionId: 'ws002', exerciseId: 'ex001' }),
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ id: string; sessionCount: number }[]>)(event)

    expect(result).toHaveLength(1)
    expect(result[0]!.sessionCount).toBe(2)
  })

  test('returns multiple exercises each with correct sessionCount', async () => {
    mockFindManyCompletedSets.mockResolvedValueOnce([
      makeCompletedSet({ workoutSessionId: 'ws001', exerciseId: 'ex001', exerciseName: 'Bench Press' }),
      makeCompletedSet({ workoutSessionId: 'ws002', exerciseId: 'ex001', exerciseName: 'Bench Press' }),
      makeCompletedSet({ workoutSessionId: 'ws001', exerciseId: 'ex002', exerciseName: 'Squat' }),
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ id: string; sessionCount: number }[]>)(event)

    expect(result).toHaveLength(2)
    const benchPress = result.find((e) => e.id === 'ex001')
    const squat = result.find((e) => e.id === 'ex002')
    expect(benchPress?.sessionCount).toBe(2)
    expect(squat?.sessionCount).toBe(1)
  })

  test('returns list sorted by lastCompletedAt descending', async () => {
    const older = new Date('2026-03-20T12:00:00.000Z')
    const newer = new Date('2026-03-24T12:00:00.000Z')
    mockFindManyCompletedSets.mockResolvedValueOnce([
      makeCompletedSet({ workoutSessionId: 'ws001', exerciseId: 'ex001', exerciseName: 'Bench Press', completedAt: older }),
      makeCompletedSet({ workoutSessionId: 'ws002', exerciseId: 'ex002', exerciseName: 'Squat', completedAt: newer }),
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ id: string; lastCompletedAt: string }[]>)(event)

    expect(result[0]!.id).toBe('ex002')
    expect(result[1]!.id).toBe('ex001')
  })

  test('lastCompletedAt reflects the most recent session across multiple sessions', async () => {
    const older = new Date('2026-03-20T12:00:00.000Z')
    const newer = new Date('2026-03-24T12:00:00.000Z')
    mockFindManyCompletedSets.mockResolvedValueOnce([
      makeCompletedSet({ workoutSessionId: 'ws001', exerciseId: 'ex001', completedAt: older }),
      makeCompletedSet({ workoutSessionId: 'ws002', exerciseId: 'ex001', completedAt: newer }),
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ id: string; lastCompletedAt: string }[]>)(event)

    expect(result).toHaveLength(1)
    expect(result[0]!.lastCompletedAt).toBe(newer.toISOString())
  })

  test('handles null completedAt on session without crashing', async () => {
    mockFindManyCompletedSets.mockResolvedValueOnce([
      makeCompletedSet({ workoutSessionId: 'ws001', exerciseId: 'ex001', completedAt: null }),
    ])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ id: string; lastCompletedAt: string }[]>)(event)

    // null completedAt falls back to new Date(0) — epoch ISO string
    expect(result).toHaveLength(1)
    expect(result[0]!.lastCompletedAt).toBe(new Date(0).toISOString())
  })

  test('throws 500 and logs error when completedSet.findMany fails', async () => {
    const dbError = new Error('connection reset')
    mockFindManyCompletedSets.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch exercise list' })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[GET /api/analytics/exercises] Failed to fetch exercise list',
      dbError,
    )
    consoleSpy.mockRestore()
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('Unauthorized') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 401
    h3Error.statusMessage = 'Unauthorized'
    mockFindManyCompletedSets.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(401)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
