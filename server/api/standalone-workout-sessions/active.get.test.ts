/**
 * Tests for server/api/standalone-workout-sessions/active.get.ts
 *
 * Coverage strategy:
 *  - Happy path: returns { sessions } array of in-progress sessions with
 *    workout summary and completed-set count
 *  - Empty state: returns { sessions: [] } when user has no in-progress
 *    sessions
 *  - Auth guard: 401 when event.context.userId is unset (findMany not called)
 *  - Error propagation: throws 500 when findMany rejects, logs via
 *    logger.error
 *  - H3 error pass-through: re-throws an H3 error without wrapping it as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './active.get'

const mockFindMany = (prisma as typeof prisma).standaloneWorkoutSession.findMany as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent() {
  return { path: '/api/standalone-workout-sessions/active', context: { userId: 'user001' } }
}

const mockSessions = [
  {
    id: 'sws001',
    userId: 'user001',
    standaloneWorkoutId: 'sw001',
    status: 'IN_PROGRESS',
    startedAt: new Date(),
    completedAt: null,
    _count: { completedSets: 4 },
    standaloneWorkout: { id: 'sw001', category: 'Upper Push', order: 1, name: 'Push Day' },
  },
]

describe('GET /api/standalone-workout-sessions/active', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('returns in-progress sessions with workout summary and completed-set count', async () => {
    mockFindMany.mockResolvedValueOnce(mockSessions)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual({ sessions: mockSessions })
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user001', status: 'IN_PROGRESS' },
      orderBy: { startedAt: 'desc' },
      include: {
        _count: { select: { completedSets: true } },
        standaloneWorkout: {
          select: { id: true, category: true, order: true, name: true },
        },
      },
    })
  })

  test('returns empty sessions array when user has none in progress', async () => {
    mockFindMany.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual({ sessions: [] })
  })

  test('throws 401 when userId is not set on the context (no leak)', async () => {
    const event = { path: '/api/standalone-workout-sessions/active', context: {} }
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Unauthorized' })

    expect(mockFindMany).not.toHaveBeenCalled()
  })

  test('throws 500 and logs when findMany rejects', async () => {
    const dbError = new Error('database connection lost')
    mockFindMany.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch active standalone sessions' })

    expect(logger.error).toHaveBeenCalledWith(
      { err: dbError, route: 'GET /api/standalone-workout-sessions/active' },
      '[GET /api/standalone-workout-sessions/active] Failed to fetch active sessions',
    )
    consoleSpy.mockRestore()
  })

  test('re-throws an H3 error without wrapping it as 500', async () => {
    const h3Error = new Error('Forbidden') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 403
    h3Error.statusMessage = 'Forbidden'
    mockFindMany.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(403)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
