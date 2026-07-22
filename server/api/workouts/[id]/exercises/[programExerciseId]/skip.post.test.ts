import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './skip.post'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockTransaction = (prisma as typeof prisma).$transaction as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

// Transaction-scoped mocks
const txMocks = {
  findUniqueSession: vi.fn(),
  findFirstProgramExercise: vi.fn(),
  findUniqueExistingSkip: vi.fn(),
  createSkip: vi.fn(),
  deleteManyTemplateSets: vi.fn(),
  deleteManyExtraSets: vi.fn(),
  deleteSwap: vi.fn(),
  deleteManySwaps: vi.fn(),
}

function makeEvent(id = 'ws001', programExerciseId = 'pe001') {
  mockGetRouterParam.mockImplementation((_event: unknown, param: string) => {
    if (param === 'id') return id
    if (param === 'programExerciseId') return programExerciseId
    return undefined
  })
  return {
    path: `/api/workouts/${id}/exercises/${programExerciseId}/skip`,
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

const mockProgramExercise = {
  id: 'pe001',
  exerciseId: 'ex001',
  sets: [{ id: 'es001' }, { id: 'es002' }],
}

const mockSkip = {
  id: 'skip001',
  workoutSessionId: 'ws001',
  programExerciseId: 'pe001',
  createdAt: new Date(),
}

describe('POST /api/workouts/:id/exercises/:programExerciseId/skip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      let deleteManyCallCount = 0
      const tx = {
        workoutSession: { findUnique: txMocks.findUniqueSession },
        programExercise: { findFirst: txMocks.findFirstProgramExercise },
        completedSet: {
          deleteMany: (...args: unknown[]) => {
            deleteManyCallCount++
            return deleteManyCallCount === 1
              ? txMocks.deleteManyTemplateSets(...args)
              : txMocks.deleteManyExtraSets(...args)
          },
        },
        workoutExerciseSkip: { findUnique: txMocks.findUniqueExistingSkip, create: txMocks.createSkip },
        workoutExerciseSwap: { delete: txMocks.deleteSwap, deleteMany: txMocks.deleteManySwaps },
      }
      return fn(tx)
    })
  })

  test('skips exercise, deletes its logged sets only, returns 201 with { skip, deletedSetCount }', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findFirstProgramExercise.mockResolvedValueOnce(mockProgramExercise)
    txMocks.findUniqueExistingSkip.mockResolvedValueOnce(null)
    txMocks.deleteManyTemplateSets.mockResolvedValueOnce({ count: 2 })
    txMocks.deleteManyExtraSets.mockResolvedValueOnce({ count: 1 })
    txMocks.createSkip.mockResolvedValueOnce(mockSkip)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ skip: typeof mockSkip; deletedSetCount: number }>)(event)

    expect(result.skip).toEqual(mockSkip)
    expect(result.deletedSetCount).toBe(3)
    expect(event.node.res.statusCode).toBe(201)
    // Deletions are scoped to the target exercise only — a superset partner's
    // sets do not match either where-clause and survive.
    expect(txMocks.deleteManyTemplateSets).toHaveBeenCalledWith({
      where: { workoutSessionId: 'ws001', exerciseSetId: { in: ['es001', 'es002'] } },
    })
    expect(txMocks.deleteManyExtraSets).toHaveBeenCalledWith({
      where: { workoutSessionId: 'ws001', exerciseSetId: null, programExerciseId: 'pe001' },
    })
    expect(txMocks.createSkip).toHaveBeenCalledWith({
      data: { workoutSessionId: 'ws001', programExerciseId: 'pe001' },
    })
  })

  test('returns deletedSetCount: 0 when no sets were logged', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findFirstProgramExercise.mockResolvedValueOnce({ ...mockProgramExercise, sets: [] })
    txMocks.findUniqueExistingSkip.mockResolvedValueOnce(null)
    txMocks.deleteManyTemplateSets.mockResolvedValueOnce({ count: 0 })
    txMocks.deleteManyExtraSets.mockResolvedValueOnce({ count: 0 })
    txMocks.createSkip.mockResolvedValueOnce(mockSkip)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ skip: typeof mockSkip; deletedSetCount: number }>)(event)

    expect(result.deletedSetCount).toBe(0)
  })

  test('does not touch an existing swap record for the slot', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findFirstProgramExercise.mockResolvedValueOnce(mockProgramExercise)
    txMocks.findUniqueExistingSkip.mockResolvedValueOnce(null)
    txMocks.deleteManyTemplateSets.mockResolvedValueOnce({ count: 0 })
    txMocks.deleteManyExtraSets.mockResolvedValueOnce({ count: 0 })
    txMocks.createSkip.mockResolvedValueOnce(mockSkip)

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(txMocks.deleteSwap).not.toHaveBeenCalled()
    expect(txMocks.deleteManySwaps).not.toHaveBeenCalled()
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

  test('throws 409 when session is COMPLETED', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce({ ...mockSession, status: 'COMPLETED' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Session is not in progress' })
  })

  test('throws 409 when session is EDITING', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce({ ...mockSession, status: 'EDITING' })

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

  test('throws 409 when exercise is already skipped', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findFirstProgramExercise.mockResolvedValueOnce(mockProgramExercise)
    txMocks.findUniqueExistingSkip.mockResolvedValueOnce(mockSkip)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Exercise already skipped' })

    expect(txMocks.createSkip).not.toHaveBeenCalled()
    expect(txMocks.deleteManyTemplateSets).not.toHaveBeenCalled()
  })

  test('maps P2002 from a concurrent skip to 409', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findFirstProgramExercise.mockResolvedValueOnce(mockProgramExercise)
    txMocks.findUniqueExistingSkip.mockResolvedValueOnce(null)
    txMocks.deleteManyTemplateSets.mockResolvedValueOnce({ count: 0 })
    txMocks.deleteManyExtraSets.mockResolvedValueOnce({ count: 0 })
    const p2002 = new Error('Unique constraint failed') as Error & { code: string }
    p2002.code = 'P2002'
    txMocks.createSkip.mockRejectedValueOnce(p2002)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Exercise already skipped' })
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

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to skip exercise' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'POST /api/workouts/:id/exercises/:programExerciseId/skip' }, '[POST /api/workouts/:id/exercises/:programExerciseId/skip] Failed to skip exercise')
  })
})
