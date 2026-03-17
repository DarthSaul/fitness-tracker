import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.post'

const mockTransaction = (prisma as typeof prisma).$transaction as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

// Transaction-scoped mocks (used inside the interactive transaction callback)
const txMocks = {
  findFirstUserProgram: vi.fn(),
  findFirstSession: vi.fn(),
  findFirstDay: vi.fn(),
  createSession: vi.fn(),
}

function makeEvent() {
  return {
    path: '/api/workouts',
    context: { userId: 'user001' },
    node: { res: { statusCode: 200 } },
  }
}

const mockActiveProgram = {
  id: 'up001',
  userId: 'user001',
  programId: 'prog001',
  isActive: true,
  currentWeek: 1,
  currentDay: 2,
}

const mockDay = {
  id: 'd1',
  dayNumber: 2,
  name: 'Day 2',
  warmUp: null,
  exerciseGroups: [
    {
      id: 'eg1',
      order: 1,
      type: 'STANDARD',
      exercises: [
        {
          id: 'pe1',
          order: 1,
          exercise: { id: 'ex1', name: 'Bench Press' },
          sets: [{ id: 'es1', setNumber: 1, reps: 8, weight: 60, rpe: null, notes: null }],
        },
      ],
    },
  ],
}

const mockSession = {
  id: 'ws001',
  userId: 'user001',
  userProgramId: 'up001',
  weekNumber: 1,
  dayNumber: 2,
  status: 'IN_PROGRESS',
  startedAt: new Date(),
  completedAt: null,
}

describe('POST /api/workouts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    // Interactive transaction: execute the callback with a tx object containing our mocks
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        userProgram: { findFirst: txMocks.findFirstUserProgram },
        workoutSession: { findFirst: txMocks.findFirstSession, create: txMocks.createSession },
        programDay: { findFirst: txMocks.findFirstDay },
      }
      return fn(tx)
    })
  })

  test('starts a workout session and returns 201 with session and day', async () => {
    txMocks.findFirstUserProgram.mockResolvedValueOnce(mockActiveProgram)
    txMocks.findFirstSession.mockResolvedValueOnce(null)
    txMocks.findFirstDay.mockResolvedValueOnce(mockDay)
    txMocks.createSession.mockResolvedValueOnce(mockSession)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event) as { session: unknown; day: unknown }

    expect(result.session).toEqual(mockSession)
    expect(result.day).toEqual(mockDay)
    expect(event.node.res.statusCode).toBe(201)
    expect(txMocks.findFirstSession).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userProgramId: 'up001', status: 'IN_PROGRESS' } }),
    )
    expect(txMocks.findFirstDay).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          programWeek: { programId: 'prog001', weekNumber: 1 },
          dayNumber: 2,
        },
      }),
    )
    expect(txMocks.createSession).toHaveBeenCalledWith({
      data: {
        userId: 'user001',
        userProgramId: 'up001',
        weekNumber: 1,
        dayNumber: 2,
      },
    })
  })

  test('throws 401 when userId is missing', async () => {
    const event = {
      path: '/api/workouts',
      context: { userId: undefined },
      node: { res: { statusCode: 200 } },
    }

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Unauthorized' })
  })

  test('throws 400 when no active program', async () => {
    txMocks.findFirstUserProgram.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'No active program' })
  })

  test('throws 409 when session already in progress', async () => {
    txMocks.findFirstUserProgram.mockResolvedValueOnce(mockActiveProgram)
    txMocks.findFirstSession.mockResolvedValueOnce(mockSession)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Session already in progress' })
  })

  test('throws 500 when program day not found', async () => {
    txMocks.findFirstUserProgram.mockResolvedValueOnce(mockActiveProgram)
    txMocks.findFirstSession.mockResolvedValueOnce(null)
    txMocks.findFirstDay.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Program day not found for current position' })
  })

  test('throws 409 on concurrent duplicate session (P2002)', async () => {
    const p2002Error = new Error('Unique constraint failed') as Error & { code: string }
    p2002Error.code = 'P2002'
    mockTransaction.mockRejectedValueOnce(p2002Error)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Session already in progress' })
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    txMocks.findFirstUserProgram.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to start workout session' })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[POST /api/workouts] Failed to start workout session',
      dbError,
    )
    consoleSpy.mockRestore()
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('No active program') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 400
    h3Error.statusMessage = 'No active program'
    txMocks.findFirstUserProgram.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(400)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })

  test('uses interactive $transaction for atomic check-and-create', async () => {
    txMocks.findFirstUserProgram.mockResolvedValueOnce(mockActiveProgram)
    txMocks.findFirstSession.mockResolvedValueOnce(null)
    txMocks.findFirstDay.mockResolvedValueOnce(mockDay)
    txMocks.createSession.mockResolvedValueOnce(mockSession)

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockTransaction).toHaveBeenCalledOnce()
    expect(mockTransaction).toHaveBeenCalledWith(expect.any(Function))
  })
})
