/**
 * Tests for server/api/standalone-workout-sessions/[id]/sets/[setId].patch.ts
 *
 * Coverage strategy:
 *  - Happy path: updates reps/weight and returns the updated record with the
 *    exact update() shape
 *  - Partial update: only defined fields are included in the update data
 *  - Explicit null clears a field (passes validation, included in data)
 *  - Parity with program sessions: works on a COMPLETED session (no status
 *    guard)
 *  - Param validation: 400 missing session ID, 400 missing set ID
 *  - Field validation: reps/weight >= 0 and finite, rpe in [0, 10], notes a
 *    string of <= 500 chars
 *  - Not found: 404 session not found, 404 completed set not found (findFirst
 *    is scoped to the session so cross-session set IDs 404)
 *  - Ownership: 404 when session belongs to a different user
 *  - Race: P2025 on update (set concurrently deleted) maps to 404, not 500
 *  - Error propagation: 500 on unexpected error, logs via logger.error
 *  - H3 error pass-through: re-throws an H3 error without wrapping it as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[setId].patch'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockFindUniqueSession = (prisma as typeof prisma).standaloneWorkoutSession.findUnique as ReturnType<typeof vi.fn>
const mockFindFirstCompletedSet = (prisma as typeof prisma).standaloneCompletedSet.findFirst as ReturnType<typeof vi.fn>
const mockUpdateCompletedSet = (prisma as typeof prisma).standaloneCompletedSet.update as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

/**
 * getRouterParam is called twice: first for 'id', then for 'setId'.
 * mockGetRouterParam is set up to return both values in call order.
 */
function makeEvent(id = 'sws001', setId = 'scs001') {
  mockGetRouterParam.mockReturnValueOnce(id).mockReturnValueOnce(setId)
  return {
    path: `/api/standalone-workout-sessions/${id}/sets/${setId}`,
    context: { userId: 'user001' },
  }
}

const mockSession = {
  id: 'sws001',
  userId: 'user001',
  standaloneWorkoutId: 'sw001',
  status: 'IN_PROGRESS',
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

describe('PATCH /api/standalone-workout-sessions/:id/sets/:setId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    mockReadBody.mockResolvedValue({ reps: 10, weight: 65 })
  })

  test('updates a completed set and returns the updated record', async () => {
    const updatedSet = { ...mockCompletedSet, reps: 10, weight: 65 }
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce(mockCompletedSet)
    mockUpdateCompletedSet.mockResolvedValueOnce(updatedSet)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(updatedSet)
    expect(mockFindFirstCompletedSet).toHaveBeenCalledWith({
      where: { id: 'scs001', standaloneWorkoutSessionId: 'sws001' },
    })
    expect(mockUpdateCompletedSet).toHaveBeenCalledWith({
      where: { id: 'scs001' },
      data: { reps: 10, weight: 65 },
    })
  })

  test('only includes defined fields in the update data', async () => {
    mockReadBody.mockResolvedValueOnce({ rpe: 8 })
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce(mockCompletedSet)
    mockUpdateCompletedSet.mockResolvedValueOnce({ ...mockCompletedSet, rpe: 8 })

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockUpdateCompletedSet).toHaveBeenCalledWith({
      where: { id: 'scs001' },
      data: { rpe: 8 },
    })
  })

  test('allows clearing a field with an explicit null', async () => {
    mockReadBody.mockResolvedValueOnce({ notes: null })
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce({ ...mockCompletedSet, notes: 'old note' })
    mockUpdateCompletedSet.mockResolvedValueOnce({ ...mockCompletedSet, notes: null })

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockUpdateCompletedSet).toHaveBeenCalledWith({
      where: { id: 'scs001' },
      data: { notes: null },
    })
  })

  test('works on a completed session (no status guard, parity with program sessions)', async () => {
    mockFindUniqueSession.mockResolvedValueOnce({ ...mockSession, status: 'COMPLETED' })
    mockFindFirstCompletedSet.mockResolvedValueOnce(mockCompletedSet)
    mockUpdateCompletedSet.mockResolvedValueOnce({ ...mockCompletedSet, reps: 10, weight: 65 })

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(expect.objectContaining({ reps: 10, weight: 65 }))
  })

  test('throws 400 when session ID is missing', async () => {
    mockGetRouterParam.mockReturnValueOnce(undefined).mockReturnValueOnce('scs001')
    const event = { path: '/api/standalone-workout-sessions/undefined/sets/scs001', context: { userId: 'user001' } }

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
  })

  test('throws 400 when set ID is missing', async () => {
    mockGetRouterParam.mockReturnValueOnce('sws001').mockReturnValueOnce(undefined)
    const event = { path: '/api/standalone-workout-sessions/sws001/sets/undefined', context: { userId: 'user001' } }

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing set ID' })
  })

  test('throws 400 when reps is negative', async () => {
    mockReadBody.mockResolvedValueOnce({ reps: -1 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'reps must be a non-negative number' })
  })

  test('throws 400 when reps is not finite', async () => {
    mockReadBody.mockResolvedValueOnce({ reps: Infinity })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'reps must be a non-negative number' })
  })

  test('throws 400 when weight is negative', async () => {
    mockReadBody.mockResolvedValueOnce({ weight: -5 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'weight must be a non-negative number' })
  })

  test('throws 400 when rpe is above 10', async () => {
    mockReadBody.mockResolvedValueOnce({ rpe: 11 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'rpe must be between 0 and 10' })
  })

  test('throws 400 when rpe is negative', async () => {
    mockReadBody.mockResolvedValueOnce({ rpe: -1 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'rpe must be between 0 and 10' })
  })

  test('throws 400 when notes exceeds 500 characters', async () => {
    mockReadBody.mockResolvedValueOnce({ notes: 'x'.repeat(501) })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'notes must be a string of 500 characters or less' })
  })

  test('throws 400 when notes is not a string', async () => {
    mockReadBody.mockResolvedValueOnce({ notes: 12345 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'notes must be a string of 500 characters or less' })
  })

  test('throws 404 when session does not exist', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Session not found' })
  })

  test('throws 404 when session belongs to a different user', async () => {
    mockFindUniqueSession.mockResolvedValueOnce({ ...mockSession, userId: 'other-user' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Not Found' })

    expect(mockFindFirstCompletedSet).not.toHaveBeenCalled()
  })

  test('throws 404 when the completed set is not found in this session', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Completed set not found' })

    expect(mockUpdateCompletedSet).not.toHaveBeenCalled()
  })

  test('throws 404 when the set is concurrently deleted (P2025)', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce(mockCompletedSet)
    const p2025Error = new Error('Record to update not found') as Error & { code: string }
    p2025Error.code = 'P2025'
    mockUpdateCompletedSet.mockRejectedValueOnce(p2025Error)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Completed set not found' })
  })

  test('throws 500 and logs on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockFindUniqueSession.mockRejectedValueOnce(dbError)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to update completed set' })

    expect(logger.error).toHaveBeenCalledWith(
      { err: dbError, route: 'PATCH /api/standalone-workout-sessions/:id/sets/:setId', failureMessage: 'Failed to update completed set' },
      'Standalone completed-set mutation failed',
    )
  })

  test('re-throws an H3 error without wrapping it as 500', async () => {
    const h3Error = new Error('Session not found') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'Session not found'
    mockFindUniqueSession.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(404)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
