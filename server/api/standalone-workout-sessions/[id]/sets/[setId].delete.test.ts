/**
 * Tests for server/api/standalone-workout-sessions/[id]/sets/[setId].delete.ts
 *
 * Coverage strategy:
 *  - Happy path: deletes the set (scoped findFirst + delete by id) and
 *    returns { deleted: true }
 *  - Parity with program sessions: works on a COMPLETED session (no status
 *    guard)
 *  - Param validation: 400 missing session ID, 400 missing set ID
 *  - Not found: 404 session not found, 404 completed set not found (findFirst
 *    is scoped to the session so cross-session set IDs 404)
 *  - Ownership: 404 when session belongs to a different user
 *  - Race: P2025 on delete (set concurrently deleted, e.g. a client retry)
 *    maps to 404, not 500
 *  - Error propagation: 500 on unexpected error, logs via logger.error
 *  - H3 error pass-through: re-throws an H3 error without wrapping it as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[setId].delete'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockFindUniqueSession = (prisma as typeof prisma).standaloneWorkoutSession.findUnique as ReturnType<typeof vi.fn>
const mockFindFirstCompletedSet = (prisma as typeof prisma).standaloneCompletedSet.findFirst as ReturnType<typeof vi.fn>
const mockDeleteCompletedSet = (prisma as typeof prisma).standaloneCompletedSet.delete as ReturnType<typeof vi.fn>
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

describe('DELETE /api/standalone-workout-sessions/:id/sets/:setId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('deletes a completed set and returns { deleted: true }', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce(mockCompletedSet)
    mockDeleteCompletedSet.mockResolvedValueOnce(mockCompletedSet)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual({ deleted: true })
    expect(mockFindFirstCompletedSet).toHaveBeenCalledWith({
      where: { id: 'scs001', standaloneWorkoutSessionId: 'sws001' },
    })
    expect(mockDeleteCompletedSet).toHaveBeenCalledWith({ where: { id: 'scs001' } })
  })

  test('deletes an adhoc completed set the same way', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce({ ...mockCompletedSet, standaloneWorkoutSetId: null, adhocExerciseName: 'Farmer Carries' })
    mockDeleteCompletedSet.mockResolvedValueOnce({ ...mockCompletedSet, standaloneWorkoutSetId: null, adhocExerciseName: 'Farmer Carries' })

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual({ deleted: true })
  })

  test('works on a completed session (no status guard, parity with program sessions)', async () => {
    mockFindUniqueSession.mockResolvedValueOnce({ ...mockSession, status: 'COMPLETED' })
    mockFindFirstCompletedSet.mockResolvedValueOnce(mockCompletedSet)
    mockDeleteCompletedSet.mockResolvedValueOnce(mockCompletedSet)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual({ deleted: true })
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
    expect(mockDeleteCompletedSet).not.toHaveBeenCalled()
  })

  test('throws 404 when the completed set is not found in this session', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Completed set not found' })

    expect(mockDeleteCompletedSet).not.toHaveBeenCalled()
  })

  test('throws 404 when the set is concurrently deleted (P2025)', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce(mockCompletedSet)
    const p2025Error = new Error('Record to delete does not exist') as Error & { code: string }
    p2025Error.code = 'P2025'
    mockDeleteCompletedSet.mockRejectedValueOnce(p2025Error)

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
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to delete completed set' })

    expect(logger.error).toHaveBeenCalledWith(
      { err: dbError, route: 'DELETE /api/standalone-workout-sessions/:id/sets/:setId', failureMessage: 'Failed to delete completed set' },
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
