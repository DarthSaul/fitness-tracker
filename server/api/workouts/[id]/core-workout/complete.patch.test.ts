import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './complete.patch'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockFindUniqueSession = (prisma as typeof prisma).workoutSession.findUnique as ReturnType<typeof vi.fn>
const mockFindUniqueCoreWorkout = (prisma as typeof prisma).coreWorkout.findUnique as ReturnType<typeof vi.fn>
const mockUpdateCoreWorkout = (prisma as typeof prisma).coreWorkout.update as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id = 'ws001') {
  mockGetRouterParam.mockReturnValue(id)
  return {
    path: `/api/workouts/${id}/core-workout/complete`,
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

const mockCompleted = {
  ...mockCoreWorkout,
  completedAt: new Date(),
  exercises: [
    { id: 'cwe001', order: 1, exercise: { id: 'ex101', name: 'Plank' } },
  ],
}

describe('PATCH /api/workouts/:id/core-workout/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    mockReadBody.mockResolvedValue({})
  })

  test('marks the core workout completed with the current time by default', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindUniqueCoreWorkout.mockResolvedValueOnce(mockCoreWorkout)
    mockUpdateCoreWorkout.mockResolvedValueOnce(mockCompleted)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockCompleted)
    expect(mockUpdateCoreWorkout).toHaveBeenCalledWith({
      where: { id: 'cw001' },
      data: { completedAt: expect.any(Date) },
      include: {
        exercises: {
          orderBy: { order: 'asc' },
          include: { exercise: { select: { id: true, name: true } } },
        },
      },
    })
  })

  test('accepts an explicit completedAt for backdating', async () => {
    mockReadBody.mockResolvedValueOnce({ completedAt: '2026-07-01T10:00:00.000Z' })
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindUniqueCoreWorkout.mockResolvedValueOnce(mockCoreWorkout)
    mockUpdateCoreWorkout.mockResolvedValueOnce(mockCompleted)

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockUpdateCoreWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { completedAt: new Date('2026-07-01T10:00:00.000Z') },
      }),
    )
  })

  test('works when the session is already completed (no status gate)', async () => {
    mockFindUniqueSession.mockResolvedValueOnce({ ...mockSession, status: 'COMPLETED' })
    mockFindUniqueCoreWorkout.mockResolvedValueOnce(mockCoreWorkout)
    mockUpdateCoreWorkout.mockResolvedValueOnce(mockCompleted)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockCompleted)
  })

  test('throws 400 when session id is missing', async () => {
    const event = makeEvent(undefined as unknown as string)
    mockGetRouterParam.mockReturnValue(undefined)

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
  })

  test('throws 400 when completedAt is not a valid date', async () => {
    mockReadBody.mockResolvedValueOnce({ completedAt: 'not-a-date' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid completedAt date' })
  })

  test('throws 400 when completedAt is in the future', async () => {
    mockReadBody.mockResolvedValueOnce({ completedAt: new Date(Date.now() + 86_400_000).toISOString() })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'completedAt cannot be in the future' })
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
  })

  test('throws 409 when the core workout is already completed', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindUniqueCoreWorkout.mockResolvedValueOnce({ ...mockCoreWorkout, completedAt: new Date() })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Core workout already completed' })
    expect(mockUpdateCoreWorkout).not.toHaveBeenCalled()
  })

  test('maps a concurrent delete (P2025) to 404 instead of 500', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindUniqueCoreWorkout.mockResolvedValueOnce(mockCoreWorkout)
    const p2025Error = new Error('Record to update not found') as Error & { code: string }
    p2025Error.code = 'P2025'
    mockUpdateCoreWorkout.mockRejectedValueOnce(p2025Error)

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
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to complete core workout' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'PATCH /api/workouts/:id/core-workout/complete' }, '[PATCH /api/workouts/:id/core-workout/complete] Failed to complete core workout')
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
