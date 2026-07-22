/**
 * Tests for server/api/standalone-workout-sessions/[id]/sets.post.ts
 *
 * Coverage strategy:
 *  - Happy path (prescribed set): standaloneWorkoutSetId branch, exact
 *    create() shape
 *  - Happy path (adhoc exercise): adhocExerciseName branch, exact create()
 *    shape
 *  - Discriminator validation: 400 when both or neither of
 *    standaloneWorkoutSetId / adhocExerciseName are provided
 *  - Field validation: reps/weight >= 0, non-finite rejected, rpe in
 *    [0, 10], notes <= 500 chars and must be a string
 *  - Not found: 404 session not found, 404 exercise set not found
 *    (prescribed only)
 *  - Ownership: 404 when session belongs to a different user
 *  - Conflict: 409 when session already completed; 409 on P2002 duplicate
 *    submission
 *  - Cross-workout guard: 400 when the prescribed set belongs to a
 *    different workout
 *  - Error propagation: 500 on unexpected error, logs via logger.error
 *  - H3 error pass-through: re-throws an H3 error without wrapping it as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './sets.post'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockTransaction = (prisma as typeof prisma).$transaction as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

// Transaction-scoped mocks
const txMocks = {
  findUniqueSession: vi.fn(),
  findUniqueSet: vi.fn(),
  createCompletedSet: vi.fn(),
}

function makeEvent(id = 'sws001') {
  mockGetRouterParam.mockReturnValue(id)
  return {
    path: `/api/standalone-workout-sessions/${id}/sets`,
    context: { userId: 'user001' },
    node: { res: { statusCode: 200 } },
  }
}

const mockSession = {
  id: 'sws001',
  userId: 'user001',
  standaloneWorkoutId: 'sw001',
  status: 'IN_PROGRESS',
}

const mockPrescribedSet = {
  id: 'swset001',
  standaloneWorkoutExercise: {
    group: { standaloneWorkoutId: 'sw001' },
  },
}

const mockCompletedSet = {
  id: 'scs001',
  standaloneWorkoutSessionId: 'sws001',
  standaloneWorkoutSetId: 'swset001',
  adhocExerciseName: null,
  reps: 8,
  weight: 60,
  rpe: 7,
  notes: null,
  completedAt: new Date(),
}

describe('POST /api/standalone-workout-sessions/:id/sets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    mockReadBody.mockResolvedValue({ standaloneWorkoutSetId: 'swset001', reps: 8, weight: 60, rpe: 7 })
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        standaloneWorkoutSession: { findUnique: txMocks.findUniqueSession },
        standaloneWorkoutSet: { findUnique: txMocks.findUniqueSet },
        standaloneCompletedSet: { create: txMocks.createCompletedSet },
      }
      return fn(tx)
    })
  })

  test('records a completed set for a prescribed exercise and returns 201', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findUniqueSet.mockResolvedValueOnce(mockPrescribedSet)
    txMocks.createCompletedSet.mockResolvedValueOnce(mockCompletedSet)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockCompletedSet)
    expect(event.node.res.statusCode).toBe(201)
    expect(txMocks.findUniqueSet).toHaveBeenCalledWith({
      where: { id: 'swset001' },
      include: { standaloneWorkoutExercise: { include: { group: true } } },
    })
    expect(txMocks.createCompletedSet).toHaveBeenCalledWith({
      data: {
        standaloneWorkoutSessionId: 'sws001',
        standaloneWorkoutSetId: 'swset001',
        reps: 8,
        weight: 60,
        rpe: 7,
        notes: undefined,
      },
    })
  })

  test('records a completed set for an adhoc exercise and returns 201', async () => {
    mockReadBody.mockResolvedValueOnce({ adhocExerciseName: 'Farmer Carries', reps: 10, weight: 40 })
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.createCompletedSet.mockResolvedValueOnce({ ...mockCompletedSet, standaloneWorkoutSetId: null, adhocExerciseName: 'Farmer Carries' })

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(event.node.res.statusCode).toBe(201)
    expect(result).toEqual({ ...mockCompletedSet, standaloneWorkoutSetId: null, adhocExerciseName: 'Farmer Carries' })
    expect(txMocks.findUniqueSet).not.toHaveBeenCalled()
    expect(txMocks.createCompletedSet).toHaveBeenCalledWith({
      data: {
        standaloneWorkoutSessionId: 'sws001',
        adhocExerciseName: 'Farmer Carries',
        reps: 10,
        weight: 40,
        rpe: undefined,
        notes: undefined,
      },
    })
  })

  test('throws 400 when session id is missing', async () => {
    const event = makeEvent(undefined as unknown as string)
    mockGetRouterParam.mockReturnValue(undefined)

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
  })

  test('throws 400 when neither standaloneWorkoutSetId nor adhocExerciseName is provided', async () => {
    mockReadBody.mockResolvedValueOnce({ reps: 8 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Provide exactly one of standaloneWorkoutSetId or adhocExerciseName' })
  })

  test('throws 400 when the request body is null (falls back to empty object)', async () => {
    mockReadBody.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Provide exactly one of standaloneWorkoutSetId or adhocExerciseName' })
  })

  test('throws 400 when both standaloneWorkoutSetId and adhocExerciseName are provided', async () => {
    mockReadBody.mockResolvedValueOnce({ standaloneWorkoutSetId: 'swset001', adhocExerciseName: 'Farmer Carries' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Provide exactly one of standaloneWorkoutSetId or adhocExerciseName' })
  })

  test('throws 400 when standaloneWorkoutSetId is whitespace only (treated as neither)', async () => {
    mockReadBody.mockResolvedValueOnce({ standaloneWorkoutSetId: '   ' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Provide exactly one of standaloneWorkoutSetId or adhocExerciseName' })
  })

  test('throws 400 when reps is negative', async () => {
    mockReadBody.mockResolvedValueOnce({ standaloneWorkoutSetId: 'swset001', reps: -1 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'reps must be a non-negative number' })
  })

  test('throws 400 when reps is not finite', async () => {
    mockReadBody.mockResolvedValueOnce({ standaloneWorkoutSetId: 'swset001', reps: Infinity })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'reps must be a non-negative number' })
  })

  test('throws 400 when weight is negative', async () => {
    mockReadBody.mockResolvedValueOnce({ standaloneWorkoutSetId: 'swset001', weight: -5 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'weight must be a non-negative number' })
  })

  test('throws 400 when weight is not finite', async () => {
    mockReadBody.mockResolvedValueOnce({ standaloneWorkoutSetId: 'swset001', weight: Infinity })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'weight must be a non-negative number' })
  })

  test('throws 400 when rpe is above 10', async () => {
    mockReadBody.mockResolvedValueOnce({ standaloneWorkoutSetId: 'swset001', rpe: 11 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'rpe must be between 0 and 10' })
  })

  test('throws 400 when rpe is negative', async () => {
    mockReadBody.mockResolvedValueOnce({ standaloneWorkoutSetId: 'swset001', rpe: -1 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'rpe must be between 0 and 10' })
  })

  test('throws 400 when notes exceeds 500 characters', async () => {
    mockReadBody.mockResolvedValueOnce({ standaloneWorkoutSetId: 'swset001', notes: 'x'.repeat(501) })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'notes must be a string of 500 characters or less' })
  })

  test('throws 400 when notes is not a string', async () => {
    mockReadBody.mockResolvedValueOnce({ standaloneWorkoutSetId: 'swset001', notes: 12345 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'notes must be a string of 500 characters or less' })
  })

  test('throws 404 when session does not exist', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Session not found' })
  })

  test('throws 404 when session belongs to a different user', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce({ ...mockSession, userId: 'other-user' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Not Found' })
  })

  test('throws 409 when session is already completed', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce({ ...mockSession, status: 'COMPLETED' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Session already completed' })
  })

  test('throws 404 when the prescribed exercise set is not found', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findUniqueSet.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Exercise set not found' })
  })

  test('throws 400 when the prescribed set belongs to a different workout', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findUniqueSet.mockResolvedValueOnce({
      id: 'swset001',
      standaloneWorkoutExercise: { group: { standaloneWorkoutId: 'sw-other' } },
    })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Exercise set does not belong to this workout' })
  })

  test('throws 409 when a duplicate set is submitted (P2002)', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findUniqueSet.mockResolvedValueOnce(mockPrescribedSet)
    const p2002Error = new Error('Unique constraint failed') as Error & { code: string }
    p2002Error.code = 'P2002'
    txMocks.createCompletedSet.mockRejectedValueOnce(p2002Error)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Set already recorded for this session' })
  })

  test('throws 500 and logs on unexpected error', async () => {
    const dbError = new Error('connection reset')
    txMocks.findUniqueSession.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to record completed set' })

    expect(logger.error).toHaveBeenCalledWith(
      { err: dbError, route: 'POST /api/standalone-workout-sessions/:id/sets' },
      '[POST /api/standalone-workout-sessions/:id/sets] Failed to record completed set',
    )
    consoleSpy.mockRestore()
  })

  test('re-throws an H3 error without wrapping it as 500', async () => {
    const h3Error = new Error('Session not found') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'Session not found'
    txMocks.findUniqueSession.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(404)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
