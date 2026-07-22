import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './skip.delete'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>
const mockFindUniqueSession = (prisma as typeof prisma).workoutSession.findUnique as ReturnType<typeof vi.fn>
const mockDeleteManySkips = (prisma as typeof prisma).workoutExerciseSkip.deleteMany as ReturnType<typeof vi.fn>

function makeEvent(id = 'ws001', programExerciseId = 'pe001') {
  mockGetRouterParam.mockImplementation((_event: unknown, param: string) => {
    if (param === 'id') return id
    if (param === 'programExerciseId') return programExerciseId
    return undefined
  })
  return {
    path: `/api/workouts/${id}/exercises/${programExerciseId}/skip`,
    context: { userId: 'user001' },
  }
}

const mockSession = {
  id: 'ws001',
  userId: 'user001',
  weekNumber: 1,
  dayNumber: 2,
  status: 'IN_PROGRESS',
}

describe('DELETE /api/workouts/:id/exercises/:programExerciseId/skip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('removes the skip and returns { deleted: true }', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockDeleteManySkips.mockResolvedValueOnce({ count: 1 })

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ deleted: boolean }>)(event)

    expect(result).toEqual({ deleted: true })
    expect(mockDeleteManySkips).toHaveBeenCalledWith({
      where: { workoutSessionId: 'ws001', programExerciseId: 'pe001' },
    })
  })

  test('throws 400 when session ID is missing', async () => {
    const event = makeEvent()
    mockGetRouterParam.mockImplementation((_event: unknown, param: string) => {
      if (param === 'id') return undefined
      if (param === 'programExerciseId') return 'pe001'
      return undefined
    })

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
  })

  test('throws 400 when programExerciseId is missing', async () => {
    const event = makeEvent()
    mockGetRouterParam.mockImplementation((_event: unknown, param: string) => {
      if (param === 'id') return 'ws001'
      if (param === 'programExerciseId') return undefined
      return undefined
    })

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing programExerciseId' })
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
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Session not found' })

    expect(mockDeleteManySkips).not.toHaveBeenCalled()
  })

  test('throws 409 when session is not IN_PROGRESS', async () => {
    mockFindUniqueSession.mockResolvedValueOnce({ ...mockSession, status: 'COMPLETED' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Session is not in progress' })
  })

  test('throws 404 when the exercise is not skipped', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockDeleteManySkips.mockResolvedValueOnce({ count: 0 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Exercise is not skipped' })
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

  test('wraps unknown errors as 500 and logs them', async () => {
    const dbError = new Error('connection reset')
    mockFindUniqueSession.mockRejectedValueOnce(dbError)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to remove exercise skip' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'DELETE /api/workouts/:id/exercises/:programExerciseId/skip' }, '[DELETE /api/workouts/:id/exercises/:programExerciseId/skip] Failed to remove exercise skip')
  })
})
