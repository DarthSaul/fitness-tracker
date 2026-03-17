import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.post'

const mockFindFirstUserProgram = (prisma as typeof prisma).userProgram.findFirst as ReturnType<typeof vi.fn>
const mockFindFirstSession = (prisma as typeof prisma).workoutSession.findFirst as ReturnType<typeof vi.fn>
const mockFindFirstDay = (prisma as typeof prisma).programDay.findFirst as ReturnType<typeof vi.fn>
const mockCreateSession = (prisma as typeof prisma).workoutSession.create as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

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
  })

  test('starts a workout session and returns 201 with session and day', async () => {
    mockFindFirstUserProgram.mockResolvedValueOnce(mockActiveProgram)
    mockFindFirstSession.mockResolvedValueOnce(null)
    mockFindFirstDay.mockResolvedValueOnce(mockDay)
    mockCreateSession.mockResolvedValueOnce(mockSession)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event) as { session: unknown; day: unknown }

    expect(result.session).toEqual(mockSession)
    expect(result.day).toEqual(mockDay)
    expect(event.node.res.statusCode).toBe(201)
    expect(mockCreateSession).toHaveBeenCalledWith({
      data: {
        userId: 'user001',
        userProgramId: 'up001',
        weekNumber: 1,
        dayNumber: 2,
      },
    })
  })

  test('throws 400 when no active program', async () => {
    mockFindFirstUserProgram.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'No active program' })
  })

  test('throws 409 when session already in progress', async () => {
    mockFindFirstUserProgram.mockResolvedValueOnce(mockActiveProgram)
    mockFindFirstSession.mockResolvedValueOnce(mockSession)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Session already in progress' })
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockFindFirstUserProgram.mockRejectedValueOnce(dbError)
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
    mockFindFirstUserProgram.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(400)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
