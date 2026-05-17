import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './swap.post'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockTransaction = (prisma as typeof prisma).$transaction as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

// Transaction-scoped mocks
const txMocks = {
  findUniqueSession: vi.fn(),
  findFirstProgramExercise: vi.fn(),
  findUniqueExercise: vi.fn(),
  findFirstExistingSwap: vi.fn(),
  deleteManyTemplateSets: vi.fn(),
  deleteManyExtraSets: vi.fn(),
  upsertSwap: vi.fn(),
}

function makeEvent(id = 'ws001', programExerciseId = 'pe001') {
  mockGetRouterParam.mockImplementation((_event: unknown, param: string) => {
    if (param === 'id') return id
    if (param === 'programExerciseId') return programExerciseId
    return undefined
  })
  return {
    path: `/api/workouts/${id}/exercises/${programExerciseId}/swap`,
    context: { userId: 'user001' },
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

const mockProgramExercise = {
  id: 'pe001',
  exerciseId: 'ex001',
  sets: [{ id: 'es001' }, { id: 'es002' }],
  exercise: { id: 'ex001', name: 'Bench Press' },
}

const mockSwap = {
  id: 'swap001',
  workoutSessionId: 'ws001',
  programExerciseId: 'pe001',
  originalExerciseId: 'ex001',
  replacementExerciseId: 'ex002',
  createdAt: new Date(),
}

describe('POST /api/workouts/:id/exercises/:programExerciseId/swap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    mockReadBody.mockResolvedValue({ replacementExerciseId: 'ex002' })
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      let deleteManyCallCount = 0
      const tx = {
        workoutSession: { findUnique: txMocks.findUniqueSession },
        programExercise: { findFirst: txMocks.findFirstProgramExercise },
        exercise: { findUnique: txMocks.findUniqueExercise },
        completedSet: {
          deleteMany: (...args: unknown[]) => {
            deleteManyCallCount++
            return deleteManyCallCount === 1
              ? txMocks.deleteManyTemplateSets(...args)
              : txMocks.deleteManyExtraSets(...args)
          },
        },
        workoutExerciseSwap: { findFirst: txMocks.findFirstExistingSwap, upsert: txMocks.upsertSwap },
      }
      return fn(tx)
    })
  })

  test('swaps exercise, deletes logged sets, returns { swap, deletedSetCount }', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findFirstProgramExercise.mockResolvedValueOnce(mockProgramExercise)
    txMocks.findUniqueExercise.mockResolvedValueOnce({ id: 'ex002' })
    txMocks.findFirstExistingSwap.mockResolvedValueOnce(null)
    txMocks.deleteManyTemplateSets.mockResolvedValueOnce({ count: 2 })
    txMocks.deleteManyExtraSets.mockResolvedValueOnce({ count: 1 })
    txMocks.upsertSwap.mockResolvedValueOnce(mockSwap)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ swap: typeof mockSwap; deletedSetCount: number }>)(event)

    expect(result.swap).toEqual(mockSwap)
    expect(result.deletedSetCount).toBe(3)
  })

  test('returns deletedSetCount: 0 when no sets were logged', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findFirstProgramExercise.mockResolvedValueOnce({ ...mockProgramExercise, sets: [] })
    txMocks.findUniqueExercise.mockResolvedValueOnce({ id: 'ex002' })
    txMocks.findFirstExistingSwap.mockResolvedValueOnce(null)
    txMocks.deleteManyTemplateSets.mockResolvedValueOnce({ count: 0 })
    txMocks.deleteManyExtraSets.mockResolvedValueOnce({ count: 0 })
    txMocks.upsertSwap.mockResolvedValueOnce(mockSwap)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ swap: typeof mockSwap; deletedSetCount: number }>)(event)

    expect(result.deletedSetCount).toBe(0)
  })

  test('throws 400 when body is missing replacementExerciseId', async () => {
    mockReadBody.mockResolvedValueOnce({})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'replacementExerciseId must be a non-empty string' })
  })

  test('throws 400 when replacementExerciseId is empty string', async () => {
    mockReadBody.mockResolvedValueOnce({ replacementExerciseId: '   ' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'replacementExerciseId must be a non-empty string' })
  })

  test('throws 400 when session ID is missing', async () => {
    const event = makeEvent()
    // Override after makeEvent so the handler sees undefined for 'id'
    mockGetRouterParam.mockImplementation((_event: unknown, param: string) => {
      if (param === 'id') return undefined
      if (param === 'programExerciseId') return 'pe001'
      return undefined
    })

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
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

  test('throws 404 when replacementExerciseId not found in Exercise table', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findFirstProgramExercise.mockResolvedValueOnce(mockProgramExercise)
    txMocks.findUniqueExercise.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Replacement exercise not found' })
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
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to swap exercise' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'POST /api/workouts/:id/exercises/:programExerciseId/swap' }, '[POST /api/workouts/:id/exercises/:programExerciseId/swap] Failed to swap exercise')
    consoleSpy.mockRestore()
  })
})
