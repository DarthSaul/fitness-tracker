import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './active.get'

const mockFindFirstSession = (prisma as typeof prisma).workoutSession.findFirst as ReturnType<typeof vi.fn>
const mockFindFirstDay = (prisma as typeof prisma).programDay.findFirst as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent() {
  return {
    path: '/api/workouts/active',
    context: { userId: 'user001' },
  }
}

const mockSession = {
  id: 'ws001',
  userId: 'user001',
  userProgramId: 'up001',
  weekNumber: 1,
  dayNumber: 1,
  status: 'IN_PROGRESS',
  startedAt: new Date(),
  completedAt: null,
  completedSets: [
    { id: 'cs001', workoutSessionId: 'ws001', exerciseSetId: 'es001', reps: 10, weight: 135, rpe: 7, notes: null, completedAt: new Date() },
  ],
  userProgram: { id: 'up001', programId: 'prog001' },
}

const mockDay = {
  id: 'day001',
  programWeekId: 'pw001',
  dayNumber: 1,
  name: 'Push Day',
  warmUp: '5 min cardio',
  exerciseGroups: [
    {
      id: 'eg001',
      programDayId: 'day001',
      order: 1,
      type: 'STANDARD',
      restSeconds: 90,
      exercises: [
        {
          id: 'pe001',
          exerciseGroupId: 'eg001',
          exerciseId: 'ex001',
          order: 1,
          exercise: { id: 'ex001', name: 'Bench Press' },
          sets: [
            { id: 'es001', programExerciseId: 'pe001', setNumber: 1, reps: 10, weight: 135, rpe: 7, notes: null },
            { id: 'es002', programExerciseId: 'pe001', setNumber: 2, reps: 8, weight: 155, rpe: 8, notes: null },
          ],
        },
      ],
    },
  ],
}

describe('GET /api/workouts/active', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('returns active session with day template and completed sets', async () => {
    mockFindFirstSession.mockResolvedValueOnce(mockSession)
    mockFindFirstDay.mockResolvedValueOnce(mockDay)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ session: typeof mockSession; day: typeof mockDay }>)(event)

    expect(result.session).toEqual(mockSession)
    expect(result.day).toEqual(mockDay)
    expect(mockFindFirstSession).toHaveBeenCalledWith({
      where: { userId: 'user001', status: 'IN_PROGRESS' },
      include: { completedSets: true, userProgram: true },
    })
    expect(mockFindFirstDay).toHaveBeenCalledWith({
      where: {
        programWeek: { programId: 'prog001', weekNumber: 1 },
        dayNumber: 1,
      },
      include: {
        exerciseGroups: {
          orderBy: { order: 'asc' },
          include: {
            exercises: {
              orderBy: { order: 'asc' },
              include: {
                exercise: { select: { id: true, name: true } },
                sets: { orderBy: { setNumber: 'asc' } },
              },
            },
          },
        },
      },
    })
  })

  test('throws 401 when userId is missing', async () => {
    const event = { path: '/api/workouts/active', context: { userId: undefined } }

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Unauthorized' })
  })

  test('throws 404 when no active session exists', async () => {
    mockFindFirstSession.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'No active workout session' })
  })

  test('throws 500 when program day not found', async () => {
    mockFindFirstSession.mockResolvedValueOnce(mockSession)
    mockFindFirstDay.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Program day not found for session position' })
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockFindFirstSession.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch active session' })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[GET /api/workouts/active] Failed to fetch active session',
      dbError,
    )
    consoleSpy.mockRestore()
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('No active workout session') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'No active workout session'
    mockFindFirstSession.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(404)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
