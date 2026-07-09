import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './core-workout.put'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockTransaction = (prisma as typeof prisma).$transaction as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

// Transaction-scoped mocks
const txMocks = {
  findUniqueSession: vi.fn(),
  findManyExercise: vi.fn(),
  upsertCoreWorkout: vi.fn(),
  findUniqueCoreWorkout: vi.fn(),
  deleteManyEntries: vi.fn(),
  createManyEntries: vi.fn(),
}

function makeEvent(id = 'ws001') {
  mockGetRouterParam.mockReturnValue(id)
  return {
    path: `/api/workouts/${id}/core-workout`,
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
}

const mockCoreExercises = [
  { id: 'ex101', isCore: true },
  { id: 'ex102', isCore: true },
]

const mockCoreWorkout = {
  id: 'cw001',
  workoutSessionId: 'ws001',
  timeSeconds: 45,
  restSeconds: 15,
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  exercises: [
    { id: 'cwe001', order: 1, exercise: { id: 'ex101', name: 'Plank' } },
    { id: 'cwe002', order: 2, exercise: { id: 'ex102', name: 'Dead Bug' } },
  ],
}

describe('PUT /api/workouts/:id/core-workout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    mockReadBody.mockResolvedValue({ timeSeconds: 45, restSeconds: 15, exerciseIds: ['ex101', 'ex102'] })
    // Interactive transaction: execute the callback with a tx object containing our mocks
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        workoutSession: { findUnique: txMocks.findUniqueSession },
        exercise: { findMany: txMocks.findManyExercise },
        coreWorkout: { upsert: txMocks.upsertCoreWorkout, findUnique: txMocks.findUniqueCoreWorkout },
        coreWorkoutExercise: { deleteMany: txMocks.deleteManyEntries, createMany: txMocks.createManyEntries },
      }
      return fn(tx)
    })
  })

  test('creates or replaces the core workout and returns the full plan', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findManyExercise.mockResolvedValueOnce(mockCoreExercises)
    txMocks.upsertCoreWorkout.mockResolvedValueOnce({ id: 'cw001' })
    txMocks.deleteManyEntries.mockResolvedValueOnce({ count: 0 })
    txMocks.createManyEntries.mockResolvedValueOnce({ count: 2 })
    txMocks.findUniqueCoreWorkout.mockResolvedValueOnce(mockCoreWorkout)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockCoreWorkout)
    expect(txMocks.upsertCoreWorkout).toHaveBeenCalledWith({
      where: { workoutSessionId: 'ws001' },
      update: { timeSeconds: 45, restSeconds: 15, completedAt: null },
      create: { workoutSessionId: 'ws001', timeSeconds: 45, restSeconds: 15 },
    })
    expect(txMocks.deleteManyEntries).toHaveBeenCalledWith({ where: { coreWorkoutId: 'cw001' } })
    expect(txMocks.createManyEntries).toHaveBeenCalledWith({
      data: [
        { coreWorkoutId: 'cw001', exerciseId: 'ex101', order: 1 },
        { coreWorkoutId: 'cw001', exerciseId: 'ex102', order: 2 },
      ],
    })
    expect(txMocks.findUniqueCoreWorkout).toHaveBeenCalledWith({
      where: { id: 'cw001' },
      include: {
        exercises: {
          orderBy: { order: 'asc' },
          include: { exercise: { select: { id: true, name: true } } },
        },
      },
    })
  })

  test('allows the same exercise more than once, preserving order', async () => {
    mockReadBody.mockResolvedValueOnce({ timeSeconds: 30, restSeconds: 10, exerciseIds: ['ex101', 'ex101'] })
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findManyExercise.mockResolvedValueOnce([mockCoreExercises[0]])
    txMocks.upsertCoreWorkout.mockResolvedValueOnce({ id: 'cw001' })
    txMocks.deleteManyEntries.mockResolvedValueOnce({ count: 2 })
    txMocks.createManyEntries.mockResolvedValueOnce({ count: 2 })
    txMocks.findUniqueCoreWorkout.mockResolvedValueOnce(mockCoreWorkout)

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(txMocks.findManyExercise).toHaveBeenCalledWith({
      where: { id: { in: ['ex101'] } },
      select: { id: true, isCore: true },
    })
    expect(txMocks.createManyEntries).toHaveBeenCalledWith({
      data: [
        { coreWorkoutId: 'cw001', exerciseId: 'ex101', order: 1 },
        { coreWorkoutId: 'cw001', exerciseId: 'ex101', order: 2 },
      ],
    })
  })

  test('throws 400 when session id is missing', async () => {
    const event = makeEvent(undefined as unknown as string)
    mockGetRouterParam.mockReturnValue(undefined)

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
  })

  test('throws 400 when timeSeconds is missing', async () => {
    mockReadBody.mockResolvedValueOnce({ restSeconds: 15, exerciseIds: ['ex101'] })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'timeSeconds must be an integer between 1 and 3600' })
  })

  test('throws 400 when timeSeconds is zero', async () => {
    mockReadBody.mockResolvedValueOnce({ timeSeconds: 0, restSeconds: 15, exerciseIds: ['ex101'] })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'timeSeconds must be an integer between 1 and 3600' })
  })

  test('throws 400 when timeSeconds is not a whole number', async () => {
    mockReadBody.mockResolvedValueOnce({ timeSeconds: 45.5, restSeconds: 15, exerciseIds: ['ex101'] })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'timeSeconds must be an integer between 1 and 3600' })
  })

  test('throws 400 when timeSeconds exceeds 3600', async () => {
    mockReadBody.mockResolvedValueOnce({ timeSeconds: 3601, restSeconds: 15, exerciseIds: ['ex101'] })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'timeSeconds must be an integer between 1 and 3600' })
  })

  test('throws 400 when restSeconds is negative', async () => {
    mockReadBody.mockResolvedValueOnce({ timeSeconds: 45, restSeconds: -1, exerciseIds: ['ex101'] })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'restSeconds must be an integer between 0 and 3600' })
  })

  test('allows restSeconds of zero', async () => {
    mockReadBody.mockResolvedValueOnce({ timeSeconds: 45, restSeconds: 0, exerciseIds: ['ex101', 'ex102'] })
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findManyExercise.mockResolvedValueOnce(mockCoreExercises)
    txMocks.upsertCoreWorkout.mockResolvedValueOnce({ id: 'cw001' })
    txMocks.deleteManyEntries.mockResolvedValueOnce({ count: 0 })
    txMocks.createManyEntries.mockResolvedValueOnce({ count: 2 })
    txMocks.findUniqueCoreWorkout.mockResolvedValueOnce({ ...mockCoreWorkout, restSeconds: 0 })

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual({ ...mockCoreWorkout, restSeconds: 0 })
  })

  test('throws 400 when exerciseIds is not an array', async () => {
    mockReadBody.mockResolvedValueOnce({ timeSeconds: 45, restSeconds: 15, exerciseIds: 'ex101' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'exerciseIds must be a non-empty array' })
  })

  test('throws 400 when exerciseIds is empty', async () => {
    mockReadBody.mockResolvedValueOnce({ timeSeconds: 45, restSeconds: 15, exerciseIds: [] })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'exerciseIds must be a non-empty array' })
  })

  test('throws 400 when exerciseIds has more than 50 entries', async () => {
    mockReadBody.mockResolvedValueOnce({ timeSeconds: 45, restSeconds: 15, exerciseIds: Array.from({ length: 51 }, (_, i) => `ex${i}`) })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'exerciseIds must contain 50 or fewer entries' })
  })

  test('throws 400 when exerciseIds contains a non-string entry', async () => {
    mockReadBody.mockResolvedValueOnce({ timeSeconds: 45, restSeconds: 15, exerciseIds: ['ex101', 42] })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'exerciseIds must contain exercise ID strings' })
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

  test('throws 404 when an exercise does not exist', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findManyExercise.mockResolvedValueOnce([mockCoreExercises[0]])

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Exercise not found' })
  })

  test('throws 400 when an exercise is not a core exercise', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findManyExercise.mockResolvedValueOnce([mockCoreExercises[0], { id: 'ex102', isCore: false }])

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'All exercises must be core exercises' })
  })

  test('maps a concurrent create (P2002) to 409', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.findManyExercise.mockResolvedValueOnce(mockCoreExercises)
    const p2002Error = new Error('Unique constraint failed') as Error & { code: string }
    p2002Error.code = 'P2002'
    txMocks.upsertCoreWorkout.mockRejectedValueOnce(p2002Error)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Core workout was saved concurrently — retry' })
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    txMocks.findUniqueSession.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to save core workout' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'PUT /api/workouts/:id/core-workout' }, '[PUT /api/workouts/:id/core-workout] Failed to save core workout')
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
