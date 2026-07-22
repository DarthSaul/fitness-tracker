/**
 * Tests for server/api/standalone-workout-sessions/[id].get.ts
 *
 * Coverage strategy:
 *  - Happy path: returns { session, workout } with standaloneWorkout
 *    destructured out of the session payload
 *  - Validation: 400 when id param is missing or whitespace only
 *  - Not found: 404 when findUnique returns null
 *  - Ownership: 404 when session belongs to a different user
 *  - Error propagation: 500 when findUnique rejects, logs via logger.error
 *  - H3 error pass-through: re-throws an H3 error without wrapping it as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[id].get'

const mockFindUnique = (prisma as typeof prisma).standaloneWorkoutSession.findUnique as ReturnType<typeof vi.fn>
const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id = 'sws001') {
  mockGetRouterParam.mockReturnValue(id)
  return { path: `/api/standalone-workout-sessions/${id}`, context: { userId: 'user001' } }
}

const mockStandaloneWorkout = {
  id: 'sw001',
  category: 'Upper Push',
  order: 1,
  name: 'Push Day',
  groups: [
    {
      id: 'swg001',
      order: 1,
      exercises: [
        {
          id: 'swe001',
          order: 1,
          exercise: { id: 'ex001', name: 'Bench Press', description: null },
          sets: [{ id: 'sws-set001', setNumber: 1, reps: 8, weight: 60 }],
        },
      ],
    },
  ],
}

const mockSession = {
  id: 'sws001',
  userId: 'user001',
  standaloneWorkoutId: 'sw001',
  status: 'IN_PROGRESS',
  startedAt: new Date(),
  completedAt: null,
  completedSets: [],
  standaloneWorkout: mockStandaloneWorkout,
}

describe('GET /api/standalone-workout-sessions/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('returns session and workout template on success', async () => {
    mockFindUnique.mockResolvedValueOnce(mockSession)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ session: unknown; workout: unknown }>)(event)

    expect(result.workout).toEqual(mockStandaloneWorkout)
    expect(result.session).toEqual({
      id: 'sws001',
      userId: 'user001',
      standaloneWorkoutId: 'sw001',
      status: 'IN_PROGRESS',
      startedAt: mockSession.startedAt,
      completedAt: null,
      completedSets: [],
    })
    expect((result.session as { standaloneWorkout?: unknown }).standaloneWorkout).toBeUndefined()
  })

  test('queries session with completedSets and full workout template include', async () => {
    mockFindUnique.mockResolvedValueOnce(mockSession)

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'sws001' },
      include: {
        completedSets: true,
        standaloneWorkout: {
          include: {
            groups: {
              orderBy: { order: 'asc' },
              include: {
                exercises: {
                  orderBy: { order: 'asc' },
                  include: {
                    exercise: { select: { id: true, name: true, description: true } },
                    sets: { orderBy: { setNumber: 'asc' } },
                  },
                },
              },
            },
          },
        },
      },
    })
  })

  test('throws 400 when id param is undefined', async () => {
    const event = makeEvent(undefined as unknown as string)
    mockGetRouterParam.mockReturnValue(undefined)

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
  })

  test('throws 400 when id param is whitespace only', async () => {
    mockGetRouterParam.mockReturnValue('   ')
    const event = makeEvent('   ')

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
  })

  test('throws 404 when session does not exist', async () => {
    mockFindUnique.mockResolvedValueOnce(null)

    const event = makeEvent('sws999')
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Session not found' })
  })

  test('throws 404 when session belongs to a different user', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...mockSession, userId: 'other-user' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Not Found' })
  })

  test('throws 500 and logs when findUnique rejects', async () => {
    const dbError = new Error('connection reset')
    mockFindUnique.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch standalone workout session' })

    expect(logger.error).toHaveBeenCalledWith(
      { err: dbError, route: 'GET /api/standalone-workout-sessions/:id' },
      '[GET /api/standalone-workout-sessions/:id] Failed to fetch session',
    )
    consoleSpy.mockRestore()
  })

  test('re-throws an H3 error without wrapping it as 500', async () => {
    const h3Error = new Error('Session not found') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'Session not found'
    mockFindUnique.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(404)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
