import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './sets.post'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockFindUniqueSession = (prisma as typeof prisma).workoutSession.findUnique as ReturnType<typeof vi.fn>
const mockFindUniqueExerciseSet = (prisma as typeof prisma).exerciseSet.findUnique as ReturnType<typeof vi.fn>
const mockCreateCompletedSet = (prisma as typeof prisma).completedSet.create as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id = 'ws001') {
  mockGetRouterParam.mockReturnValue(id)
  return {
    path: `/api/workouts/${id}/sets`,
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
  userProgram: { id: 'up001', programId: 'prog001' },
}

const mockExerciseSet = {
  id: 'es001',
  programExercise: {
    exerciseGroup: {
      programDay: {
        dayNumber: 2,
        programWeek: { weekNumber: 1, programId: 'prog001' },
      },
    },
  },
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

describe('POST /api/workouts/:id/sets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    mockReadBody.mockResolvedValue({ exerciseSetId: 'es001', reps: 8, weight: 60, rpe: 7 })
  })

  test('records a completed set and returns 201', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindUniqueExerciseSet.mockResolvedValueOnce(mockExerciseSet)
    mockCreateCompletedSet.mockResolvedValueOnce(mockCompletedSet)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockCompletedSet)
    expect(event.node.res.statusCode).toBe(201)
    expect(mockCreateCompletedSet).toHaveBeenCalledWith({
      data: {
        workoutSessionId: 'ws001',
        exerciseSetId: 'es001',
        reps: 8,
        weight: 60,
        rpe: 7,
        notes: undefined,
      },
    })
  })

  test('throws 401 when userId is missing', async () => {
    mockGetRouterParam.mockReturnValue('ws001')
    const event = {
      path: '/api/workouts/ws001/sets',
      context: { userId: undefined },
      node: { res: { statusCode: 200 } },
    }

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Unauthorized' })
  })

  test('throws 400 when exerciseSetId is not a string', async () => {
    mockReadBody.mockResolvedValueOnce({ exerciseSetId: 123 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing exerciseSetId' })
  })

  test('throws 400 when reps is Infinity', async () => {
    mockReadBody.mockResolvedValueOnce({ exerciseSetId: 'es001', reps: Infinity })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'reps must be a non-negative number' })
  })

  test('throws 400 when weight is Infinity', async () => {
    mockReadBody.mockResolvedValueOnce({ exerciseSetId: 'es001', weight: Infinity })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'weight must be a non-negative number' })
  })

  test('throws 400 when session id is missing', async () => {
    const event = makeEvent(undefined as unknown as string)
    mockGetRouterParam.mockReturnValue(undefined)

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
  })

  test('throws 400 when exerciseSetId is missing', async () => {
    mockReadBody.mockResolvedValueOnce({ reps: 8, weight: 60 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing exerciseSetId' })
  })

  test('throws 404 when session not found', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Session not found' })
  })

  test('throws 403 when session belongs to another user', async () => {
    mockFindUniqueSession.mockResolvedValueOnce({ ...mockSession, userId: 'other-user' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 403, statusMessage: 'Forbidden' })
  })

  test('throws 409 when session is already completed', async () => {
    mockFindUniqueSession.mockResolvedValueOnce({ ...mockSession, status: 'COMPLETED' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Session already completed' })
  })

  test('throws 400 when exercise set does not belong to this workout day', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindUniqueExerciseSet.mockResolvedValueOnce({
      ...mockExerciseSet,
      programExercise: {
        exerciseGroup: {
          programDay: {
            dayNumber: 3, // wrong day
            programWeek: { weekNumber: 1, programId: 'prog001' },
          },
        },
      },
    })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Exercise set does not belong to this workout day' })
  })

  test('throws 400 when reps is negative', async () => {
    mockReadBody.mockResolvedValueOnce({ exerciseSetId: 'es001', reps: -1 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'reps must be a non-negative number' })
  })

  test('throws 400 when weight is negative', async () => {
    mockReadBody.mockResolvedValueOnce({ exerciseSetId: 'es001', weight: -5 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'weight must be a non-negative number' })
  })

  test('throws 400 when rpe is out of range', async () => {
    mockReadBody.mockResolvedValueOnce({ exerciseSetId: 'es001', rpe: 11 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'rpe must be between 0 and 10' })
  })

  test('throws 400 when notes exceeds 500 characters', async () => {
    mockReadBody.mockResolvedValueOnce({ exerciseSetId: 'es001', notes: 'x'.repeat(501) })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'notes must be a string of 500 characters or less' })
  })

  test('throws 409 when duplicate set is submitted (P2002)', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindUniqueExerciseSet.mockResolvedValueOnce(mockExerciseSet)
    const p2002Error = new Error('Unique constraint failed') as Error & { code: string }
    p2002Error.code = 'P2002'
    mockCreateCompletedSet.mockRejectedValueOnce(p2002Error)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Set already recorded for this session' })
  })

  test('throws 404 when exercise set not found', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindUniqueExerciseSet.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Exercise set not found' })
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockFindUniqueSession.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to record completed set' })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[POST /api/workouts/:id/sets] Failed to record completed set',
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
