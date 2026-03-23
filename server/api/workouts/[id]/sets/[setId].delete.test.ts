import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[setId].delete'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockFindUniqueSession = (prisma as typeof prisma).workoutSession.findUnique as ReturnType<typeof vi.fn>
const mockFindFirstCompletedSet = (prisma as typeof prisma).completedSet.findFirst as ReturnType<typeof vi.fn>
const mockDeleteCompletedSet = (prisma as typeof prisma).completedSet.delete as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

/**
 * getRouterParam is called twice per handler invocation: once for 'id', once for 'setId'.
 */
function makeEvent(id = 'ws001', setId = 'cs001') {
  mockGetRouterParam.mockReturnValueOnce(id).mockReturnValueOnce(setId)
  return {
    path: `/api/workouts/${id}/sets/${setId}`,
    context: { userId: 'user001' },
  }
}

const mockSession = {
  id: 'ws001',
  userId: 'user001',
  userProgramId: 'up001',
  status: 'IN_PROGRESS',
}

const mockCompletedSet = {
  id: 'cs001',
  workoutSessionId: 'ws001',
  exerciseSetId: 'es001',
  reps: 8,
  weight: 60,
  rpe: 7,
  notes: null,
  completedAt: new Date(),
}

describe('DELETE /api/workouts/:id/sets/:setId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('deletes a completed set and returns deleted: true', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce(mockCompletedSet)
    mockDeleteCompletedSet.mockResolvedValueOnce(mockCompletedSet)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ deleted: boolean }>)(event)

    expect(result).toEqual({ deleted: true })
    expect(mockDeleteCompletedSet).toHaveBeenCalledWith({ where: { id: 'cs001' } })
  })

  test('queries completed set scoped to the session ID', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce(mockCompletedSet)
    mockDeleteCompletedSet.mockResolvedValueOnce(mockCompletedSet)

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockFindFirstCompletedSet).toHaveBeenCalledWith({
      where: { id: 'cs001', workoutSessionId: 'ws001' },
    })
  })

  test('throws 400 when session ID is missing', async () => {
    mockGetRouterParam.mockReturnValueOnce(undefined).mockReturnValueOnce('cs001')
    const event = { path: '/api/workouts/undefined/sets/cs001', context: { userId: 'user001' } }

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
  })

  test('throws 400 when set ID is missing', async () => {
    mockGetRouterParam.mockReturnValueOnce('ws001').mockReturnValueOnce(undefined)
    const event = { path: '/api/workouts/ws001/sets/undefined', context: { userId: 'user001' } }

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing set ID' })
  })

  test('throws 400 when session ID is whitespace only', async () => {
    mockGetRouterParam.mockReturnValueOnce('   ').mockReturnValueOnce('cs001')
    const event = { path: '/api/workouts/   /sets/cs001', context: { userId: 'user001' } }

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
  })

  test('throws 400 when set ID is whitespace only', async () => {
    mockGetRouterParam.mockReturnValueOnce('ws001').mockReturnValueOnce('   ')
    const event = { path: '/api/workouts/ws001/sets/   ', context: { userId: 'user001' } }

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing set ID' })
  })

  test('throws 404 when session does not exist', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(null)

    const event = makeEvent('ws999')
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
  })

  test('throws 404 when completed set does not exist or does not belong to the session', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Completed set not found' })
  })

  test('does not call delete when set is not found', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce(null)

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch(() => {})

    expect(mockDeleteCompletedSet).not.toHaveBeenCalled()
  })

  test('allows deleting a set from a completed session', async () => {
    const completedSession = { ...mockSession, status: 'COMPLETED' }
    mockFindUniqueSession.mockResolvedValueOnce(completedSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce(mockCompletedSet)
    mockDeleteCompletedSet.mockResolvedValueOnce(mockCompletedSet)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ deleted: boolean }>)(event)

    expect(result).toEqual({ deleted: true })
  })

  test('throws 500 on unexpected database error and logs it', async () => {
    const dbError = new Error('connection reset')
    mockFindUniqueSession.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to delete completed set' })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[DELETE /api/workouts/:id/sets/:setId] Failed to delete completed set',
      dbError,
    )
    consoleSpy.mockRestore()
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
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
