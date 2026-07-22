import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './active.get'

const mockFindFirstSession = (prisma as typeof prisma).workoutSession.findFirst as ReturnType<typeof vi.fn>
const mockFindFirstDay = (prisma as typeof prisma).programDay.findFirst as ReturnType<typeof vi.fn>
const mockFindManyExercise = (prisma as typeof prisma).exercise.findMany as ReturnType<typeof vi.fn>
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
  workoutExerciseSwaps: [],
  workoutExerciseSkips: [],
  coreWorkout: null,
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
      include: {
        completedSets: true,
        workoutExerciseSwaps: true,
        workoutExerciseSkips: true,
        userProgram: true,
        coreWorkout: {
          include: {
            exercises: {
              orderBy: { order: 'asc' },
              include: { exercise: { select: { id: true, name: true } } },
            },
          },
        },
      },
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

  test('throws 404 when no active session exists', async () => {
    mockFindFirstSession.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'No active workout session' })
  })

  test('returns 404 when only an EDITING session exists (not IN_PROGRESS)', async () => {
    // The route filters status: 'IN_PROGRESS' — findFirst returns null for EDITING sessions
    mockFindFirstSession.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'No active workout session' })

    // Confirm the query uses the IN_PROGRESS filter (not EDITING)
    expect(mockFindFirstSession).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'IN_PROGRESS' }) }),
    )
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

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'GET /api/workouts/active' }, '[GET /api/workouts/active] Failed to fetch active session')
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

  test('rewrites exercise data when a workout exercise swap exists for a program exercise', async () => {
    const mockReplacementExercise = { id: 'ex-replacement', name: 'Incline Dumbbell Press', description: 'Targets upper chest' }

    const sessionWithSwap = {
      ...mockSession,
      workoutExerciseSwaps: [
        { id: 'wes001', workoutSessionId: 'ws001', programExerciseId: 'pe001', replacementExerciseId: 'ex-replacement' },
      ],
    }

    // Deep-clone the day so mutations in the handler don't bleed between tests
    const dayWithExercise = {
      ...mockDay,
      exerciseGroups: [
        {
          ...mockDay.exerciseGroups[0]!,
          exercises: [
            {
              ...mockDay.exerciseGroups[0]!.exercises[0]!,
              exercise: { id: 'ex001', name: 'Bench Press' },
            },
          ],
        },
      ],
    }

    mockFindFirstSession.mockResolvedValueOnce(sessionWithSwap)
    mockFindFirstDay.mockResolvedValueOnce(dayWithExercise)
    mockFindManyExercise.mockResolvedValueOnce([mockReplacementExercise])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ session: unknown; day: typeof dayWithExercise }>)(event)

    const returnedExercise = result.day.exerciseGroups[0]!.exercises[0]!.exercise
    expect(returnedExercise.id).toBe('ex-replacement')
    expect(returnedExercise.name).toBe('Incline Dumbbell Press')
  })

  test('filters a skipped exercise out of the day and returns the skips list', async () => {
    const skip = { id: 'skip001', workoutSessionId: 'ws001', programExerciseId: 'pe001', createdAt: new Date() }
    const sessionWithSkip = { ...mockSession, workoutExerciseSkips: [skip] }
    const dayClone = {
      ...mockDay,
      exerciseGroups: [
        { ...mockDay.exerciseGroups[0]!, exercises: [...mockDay.exerciseGroups[0]!.exercises] },
      ],
    }

    mockFindFirstSession.mockResolvedValueOnce(sessionWithSkip)
    mockFindFirstDay.mockResolvedValueOnce(dayClone)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ session: typeof sessionWithSkip; day: typeof dayClone }>)(event)

    // Group stays (its restSeconds/order are template facts) but the skipped exercise is gone
    expect(result.day.exerciseGroups).toHaveLength(1)
    expect(result.day.exerciseGroups[0]!.exercises).toHaveLength(0)
    expect(result.session.workoutExerciseSkips).toEqual([skip])
  })

  test('skipping one exercise of a SUPERSET group leaves the partner exercise in place', async () => {
    const skip = { id: 'skip001', workoutSessionId: 'ws001', programExerciseId: 'pe001', createdAt: new Date() }
    const sessionWithSkip = { ...mockSession, workoutExerciseSkips: [skip] }
    const supersetDay = {
      ...mockDay,
      exerciseGroups: [
        {
          id: 'eg001',
          programDayId: 'day001',
          order: 1,
          type: 'SUPERSET',
          restSeconds: 60,
          exercises: [
            { id: 'pe001', exerciseGroupId: 'eg001', exerciseId: 'ex001', order: 1, exercise: { id: 'ex001', name: 'Bench Press' }, sets: [] },
            { id: 'pe002', exerciseGroupId: 'eg001', exerciseId: 'ex002', order: 2, exercise: { id: 'ex002', name: 'Bent-Over Row' }, sets: [] },
          ],
        },
      ],
    }

    mockFindFirstSession.mockResolvedValueOnce(sessionWithSkip)
    mockFindFirstDay.mockResolvedValueOnce(supersetDay)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ session: unknown; day: typeof supersetDay }>)(event)

    const group = result.day.exerciseGroups[0]!
    expect(group.type).toBe('SUPERSET')
    expect(group.exercises).toHaveLength(1)
    expect(group.exercises[0]!.id).toBe('pe002')
  })
})
