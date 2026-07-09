import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './core-workout.delete'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockFindUniqueSession = (prisma as typeof prisma).workoutSession.findUnique as ReturnType<typeof vi.fn>
const mockFindUniqueCoreWorkout = (prisma as typeof prisma).coreWorkout.findUnique as ReturnType<typeof vi.fn>
const mockDeleteCoreWorkout = (prisma as typeof prisma).coreWorkout.delete as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id = 'ws001') {
  mockGetRouterParam.mockReturnValue(id)
  return {
    path: `/api/workouts/${id}/core-workout`,
    context: { userId: 'user001' },
  }
}

const mockSession = {
  id: 'ws001',
  userId: 'user001',
  userProgramId: 'up001',
  status: 'IN_PROGRESS',
}

const mockCoreWorkout = {
  id: 'cw001',
  workoutSessionId: 'ws001',
  timeSeconds: 45,
  restSeconds: 15,
  completedAt: null,
}

describe('DELETE /api/workouts/:id/core-workout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('deletes the core workout and returns { deleted: true }', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindUniqueCoreWorkout.mockResolvedValueOnce(mockCoreWorkout)
    mockDeleteCoreWorkout.mockResolvedValueOnce(mockCoreWorkout)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual({ deleted: true })
    expect(mockFindUniqueCoreWorkout).toHaveBeenCalledWith({
      where: { workoutSessionId: 'ws001' },
    })
    expect(mockDeleteCoreWorkout).toHaveBeenCalledWith({ where: { id: 'cw001' } })
  })

  test('works on a completed session (no status gate)', async () => {
    mockFindUniqueSession.mockResolvedValueOnce({ ...mockSession, status: 'COMPLETED' })
    mockFindUniqueCoreWorkout.mockResolvedValueOnce(mockCoreWorkout)
    mockDeleteCoreWorkout.mockResolvedValueOnce(mockCoreWorkout)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual({ deleted: true })
  })

  test('throws 400 when session id is missing', async () => {
    const event = makeEvent(undefined as unknown as string)
    mockGetRouterParam.mockReturnValue(undefined)

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
  })

  test('throws 404 when session not found', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Session not found' })
  })

  test('throws 404 when session belongs to another user', async () => {
    mockFindUniqueSession.mockResolvedValueOnce({ ...mockSession, userId: 'other-user' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Not Found' })
  })

  test('throws 404 when no core workout exists for the session', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindUniqueCoreWorkout.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Core workout not found' })
    expect(mockDeleteCoreWorkout).not.toHaveBeenCalled()
  })

  test('maps a concurrent delete (P2025) to 404 instead of 500', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindUniqueCoreWorkout.mockResolvedValueOnce(mockCoreWorkout)
    const p2025Error = new Error('Record to delete does not exist') as Error & { code: string }
    p2025Error.code = 'P2025'
    mockDeleteCoreWorkout.mockRejectedValueOnce(p2025Error)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Core workout not found' })
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockFindUniqueSession.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to delete core workout' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'DELETE /api/workouts/:id/core-workout' }, '[DELETE /api/workouts/:id/core-workout] Failed to delete core workout')
    consoleSpy.mockRestore()
  })
})
