/**
 * Tests for server/api/standalone-workout-sessions/[id]/complete.patch.ts
 *
 * Coverage strategy:
 *  - Happy path: no body -> completedAt defaults to now
 *  - Happy path: explicit past completedAt is honored
 *  - Happy path: explicit completedAt: null clears the timestamp
 *  - Validation: 400 missing id, 400 invalid completedAt, 400 future
 *    completedAt
 *  - Not found: 404 when findUnique returns null
 *  - Ownership: 404 when session belongs to a different user
 *  - Conflict: 409 when session already completed (update not called)
 *  - Error propagation: 500 on unexpected error, logs via logger.error
 *  - H3 error pass-through: re-throws an H3 error without wrapping it as 500
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

import handler from './complete.patch'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockFindUnique = (prisma as typeof prisma).standaloneWorkoutSession.findUnique as ReturnType<typeof vi.fn>
const mockUpdate = (prisma as typeof prisma).standaloneWorkoutSession.update as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id = 'sws001') {
  mockGetRouterParam.mockReturnValue(id)
  return { path: `/api/standalone-workout-sessions/${id}/complete`, context: { userId: 'user001' } }
}

const mockSession = { id: 'sws001', userId: 'user001', status: 'IN_PROGRESS' }
const mockUpdatedSession = { ...mockSession, status: 'COMPLETED', completedAt: new Date() }

describe('PATCH /api/standalone-workout-sessions/:id/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadBody.mockResolvedValue(undefined)
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('defaults completedAt to now when no body is provided', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-20T12:00:00Z'))
    mockFindUnique.mockResolvedValueOnce(mockSession)
    mockUpdate.mockResolvedValueOnce(mockUpdatedSession)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ session: unknown }>)(event)

    expect(result).toEqual({ session: mockUpdatedSession })
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'sws001' },
      select: { id: true, userId: true, status: true },
    })
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'sws001' },
      data: { status: 'COMPLETED', completedAt: new Date('2026-07-20T12:00:00Z') },
    })
  })

  test('honors an explicit past completedAt', async () => {
    const completedAt = '2026-07-01T09:00:00Z'
    mockReadBody.mockResolvedValueOnce({ completedAt })
    mockFindUnique.mockResolvedValueOnce(mockSession)
    mockUpdate.mockResolvedValueOnce(mockUpdatedSession)

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'sws001' },
      data: { status: 'COMPLETED', completedAt: new Date(completedAt) },
    })
  })

  test('clears completedAt when explicitly set to null', async () => {
    mockReadBody.mockResolvedValueOnce({ completedAt: null })
    mockFindUnique.mockResolvedValueOnce(mockSession)
    mockUpdate.mockResolvedValueOnce({ ...mockUpdatedSession, completedAt: null })

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'sws001' },
      data: { status: 'COMPLETED', completedAt: null },
    })
  })

  test('throws 400 when id param is missing', async () => {
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

  test('throws 400 when completedAt is not a valid date', async () => {
    mockReadBody.mockResolvedValueOnce({ completedAt: 'not-a-date' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid completedAt date' })
  })

  test('throws 400 when completedAt is in the future', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    mockReadBody.mockResolvedValueOnce({ completedAt: future })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'completedAt cannot be in the future' })
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

  test('throws 409 when session is already completed', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...mockSession, status: 'COMPLETED' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Session already completed' })

    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test('throws 500 and logs on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockFindUnique.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to complete standalone workout session' })

    expect(logger.error).toHaveBeenCalledWith(
      { err: dbError, route: 'PATCH /api/standalone-workout-sessions/:id/complete' },
      '[PATCH /api/standalone-workout-sessions/:id/complete] Failed to complete session',
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
