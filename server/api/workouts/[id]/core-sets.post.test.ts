import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './core-sets.post'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockTransaction = (prisma as typeof prisma).$transaction as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

// Transaction-scoped mocks
const txMocks = {
  findUniqueSession: vi.fn(),
  findUniqueExercise: vi.fn(),
  createCompletedCoreSet: vi.fn(),
}

function makeEvent(id = 'ws001') {
  mockGetRouterParam.mockReturnValue(id)
  return {
    path: `/api/workouts/${id}/core-sets`,
    context: { userId: 'user001' },
    node: { res: { statusCode: 200 } },
  }
}

const mockSession = {
  id: 'ws001',
  userId: 'user001',
  userProgramId: 'up001',
  weekNumber: 1,
  dayNumber: 2,
  status: 'IN_PROGRESS',
  coreSectionAddedAt: new Date('2026-07-01T10:00:00Z'),
}

const mockExercise = { id: 'ex101', name: 'Plank', description: null, isCore: true }

const mockCompletedCoreSet = {
  id: 'ccs001',
  workoutSessionId: 'ws001',
  exerciseId: 'ex101',
  durationSeconds: 60,
  reps: null,
  notes: null,
  completedAt: new Date(),
  exercise: { id: 'ex101', name: 'Plank' },
}

describe('POST /api/workouts/:id/core-sets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    mockReadBody.mockResolvedValue({ exerciseId: 'ex101', durationSeconds: 60 })
    // Interactive transaction: execute the callback with a tx object containing our mocks
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        workoutSession: { findUnique: txMocks.findUniqueSession },
        exercise: { findUnique: txMocks.findUniqueExercise },
        completedCoreSet: { create: txMocks.createCompletedCoreSet },
      }
      return fn(tx)
    })
  })

  test('logs a duration-only core set and returns 201', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findUniqueExercise.mockResolvedValueOnce(mockExercise)
    txMocks.createCompletedCoreSet.mockResolvedValueOnce(mockCompletedCoreSet)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockCompletedCoreSet)
    expect(event.node.res.statusCode).toBe(201)
    expect(txMocks.createCompletedCoreSet).toHaveBeenCalledWith({
      data: {
        workoutSessionId: 'ws001',
        exerciseId: 'ex101',
        durationSeconds: 60,
        reps: null,
        notes: null,
      },
      include: { exercise: { select: { id: true, name: true } } },
    })
  })

  test('logs a reps-only core set and returns 201', async () => {
    mockReadBody.mockResolvedValueOnce({ exerciseId: 'ex101', reps: 20 })
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findUniqueExercise.mockResolvedValueOnce(mockExercise)
    txMocks.createCompletedCoreSet.mockResolvedValueOnce({ ...mockCompletedCoreSet, durationSeconds: null, reps: 20 })

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual({ ...mockCompletedCoreSet, durationSeconds: null, reps: 20 })
    expect(event.node.res.statusCode).toBe(201)
    expect(txMocks.createCompletedCoreSet).toHaveBeenCalledWith({
      data: {
        workoutSessionId: 'ws001',
        exerciseId: 'ex101',
        durationSeconds: null,
        reps: 20,
        notes: null,
      },
      include: { exercise: { select: { id: true, name: true } } },
    })
  })

  test('logs a core set with duration, reps, and notes', async () => {
    mockReadBody.mockResolvedValueOnce({ exerciseId: 'ex101', durationSeconds: 45, reps: 30, notes: 'weighted' })
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findUniqueExercise.mockResolvedValueOnce(mockExercise)
    txMocks.createCompletedCoreSet.mockResolvedValueOnce({ ...mockCompletedCoreSet, durationSeconds: 45, reps: 30, notes: 'weighted' })

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(txMocks.createCompletedCoreSet).toHaveBeenCalledWith({
      data: {
        workoutSessionId: 'ws001',
        exerciseId: 'ex101',
        durationSeconds: 45,
        reps: 30,
        notes: 'weighted',
      },
      include: { exercise: { select: { id: true, name: true } } },
    })
  })

  test('throws 400 when session id is missing', async () => {
    const event = makeEvent(undefined as unknown as string)
    mockGetRouterParam.mockReturnValue(undefined)

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
  })

  test('throws 400 when exerciseId is missing', async () => {
    mockReadBody.mockResolvedValueOnce({ durationSeconds: 60 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing exerciseId' })
  })

  test('throws 400 when exerciseId is not a string', async () => {
    mockReadBody.mockResolvedValueOnce({ exerciseId: 123, durationSeconds: 60 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing exerciseId' })
  })

  test('throws 400 when neither durationSeconds nor reps is provided', async () => {
    mockReadBody.mockResolvedValueOnce({ exerciseId: 'ex101' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'At least one of durationSeconds or reps is required' })
  })

  test('throws 400 when durationSeconds and reps are both explicitly null', async () => {
    mockReadBody.mockResolvedValueOnce({ exerciseId: 'ex101', durationSeconds: null, reps: null })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'At least one of durationSeconds or reps is required' })
  })

  test('throws 400 when durationSeconds is negative', async () => {
    mockReadBody.mockResolvedValueOnce({ exerciseId: 'ex101', durationSeconds: -10 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'durationSeconds must be a non-negative integer' })
  })

  test('throws 400 when durationSeconds is not an integer', async () => {
    mockReadBody.mockResolvedValueOnce({ exerciseId: 'ex101', durationSeconds: 30.5 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'durationSeconds must be a non-negative integer' })
  })

  test('throws 400 when reps is negative', async () => {
    mockReadBody.mockResolvedValueOnce({ exerciseId: 'ex101', reps: -1 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'reps must be a non-negative integer' })
  })

  test('throws 400 when reps is not an integer', async () => {
    mockReadBody.mockResolvedValueOnce({ exerciseId: 'ex101', reps: 12.5 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'reps must be a non-negative integer' })
  })

  test('throws 400 when notes exceeds 500 characters', async () => {
    mockReadBody.mockResolvedValueOnce({ exerciseId: 'ex101', durationSeconds: 60, notes: 'x'.repeat(501) })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'notes must be a string of 500 characters or less' })
  })

  test('throws 404 when session not found', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Session not found' })
  })

  test('throws 404 when session belongs to another user', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce({ ...mockSession, userId: 'other-user' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Not Found' })
  })

  test('throws 409 when session is not in progress', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce({ ...mockSession, status: 'COMPLETED' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Session is not in progress' })
  })

  test('throws 409 when the core section has not been added', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce({ ...mockSession, coreSectionAddedAt: null })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Core section not added to this session' })
  })

  test('throws 404 when exercise not found', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findUniqueExercise.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Exercise not found' })
  })

  test('throws 400 when exercise is not a core exercise', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findUniqueExercise.mockResolvedValueOnce({ ...mockExercise, isCore: false })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Exercise is not a core exercise' })
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    txMocks.findUniqueSession.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to log core set' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'POST /api/workouts/:id/core-sets' }, '[POST /api/workouts/:id/core-sets] Failed to log core set')
    consoleSpy.mockRestore()
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
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
