import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './extra-sets.post'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockTransaction = (prisma as typeof prisma).$transaction as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

// Transaction-scoped mocks
const txMocks = {
  findUniqueSession: vi.fn(),
  findFirstProgramExercise: vi.fn(),
  createCompletedSet: vi.fn(),
}

function makeEvent(id = 'ws001', programExerciseId = 'pe001') {
  mockGetRouterParam.mockImplementation((_event: unknown, param: string) => {
    if (param === 'id') return id
    if (param === 'programExerciseId') return programExerciseId
    return undefined
  })
  return {
    path: `/api/workouts/${id}/exercises/${programExerciseId}/extra-sets`,
    context: { userId: 'user001' },
    node: { res: { statusCode: 200 } },
  }
}

const mockSession = {
  id: 'ws001',
  userId: 'user001',
  weekNumber: 1,
  dayNumber: 2,
  status: 'IN_PROGRESS',
  userProgram: { id: 'up001', programId: 'prog001' },
}

const mockCompletedSet = {
  id: 'cs001',
  workoutSessionId: 'ws001',
  exerciseSetId: null,
  programExerciseId: 'pe001',
  reps: 8,
  weight: 60,
  rpe: null,
  notes: null,
  completedAt: new Date(),
}

describe('POST /api/workouts/:id/exercises/:programExerciseId/extra-sets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    mockReadBody.mockResolvedValue({ reps: 8, weight: 60 })
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        workoutSession: { findUnique: txMocks.findUniqueSession },
        programExercise: { findFirst: txMocks.findFirstProgramExercise },
        completedSet: { create: txMocks.createCompletedSet },
      }
      return fn(tx)
    })
  })

  test('creates extra set with 201 status and returns CompletedSet with exerciseSetId: null', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findFirstProgramExercise.mockResolvedValueOnce({ id: 'pe001' })
    txMocks.createCompletedSet.mockResolvedValueOnce(mockCompletedSet)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<typeof mockCompletedSet>)(event)

    expect(result).toEqual(mockCompletedSet)
    expect(result.exerciseSetId).toBeNull()
    expect(event.node.res.statusCode).toBe(201)
  })

  test('throws 400 when session ID is missing', async () => {
    const event = makeEvent(undefined as unknown as string)
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

  test('throws 400 when reps is not a valid number (Infinity)', async () => {
    mockReadBody.mockResolvedValueOnce({ reps: Infinity, weight: 60 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'reps must be a non-negative number' })
  })

  test('throws 400 when reps is negative', async () => {
    mockReadBody.mockResolvedValueOnce({ reps: -1, weight: 60 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'reps must be a non-negative number' })
  })

  test('throws 400 when weight is not a valid number (Infinity)', async () => {
    mockReadBody.mockResolvedValueOnce({ reps: 8, weight: Infinity })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'weight must be a non-negative number' })
  })

  test('throws 400 when weight is negative', async () => {
    mockReadBody.mockResolvedValueOnce({ reps: 8, weight: -5 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'weight must be a non-negative number' })
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
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Session not found' })
  })

  test('throws 409 when session is not IN_PROGRESS', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce({ ...mockSession, status: 'COMPLETED' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Session is not in progress' })
  })

  test("throws 400 when programExerciseId does not belong to session's day", async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findFirstProgramExercise.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: "programExerciseId does not belong to this session's day" })
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

  test('wraps unknown errors as 500 and logs them', async () => {
    const dbError = new Error('connection reset')
    txMocks.findUniqueSession.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to record extra set' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'POST /api/workouts/:id/exercises/:programExerciseId/extra-sets' }, '[POST /api/workouts/:id/exercises/:programExerciseId/extra-sets] Failed to record extra set')
    consoleSpy.mockRestore()
  })
})
