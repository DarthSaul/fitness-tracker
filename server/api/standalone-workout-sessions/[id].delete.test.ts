/**
 * Tests for server/api/standalone-workout-sessions/[id].delete.ts
 *
 * Coverage strategy:
 *  - Happy path: deletes session and returns { success: true }
 *  - Validation: 400 when id param is missing or whitespace only
 *  - Not found: 404 when findUnique returns null (delete not called)
 *  - Ownership: 404 when session belongs to a different user (delete not
 *    called)
 *  - Error propagation: 500 when findUnique rejects, logs via logger.error
 *  - H3 error pass-through: re-throws an H3 error without wrapping it as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[id].delete'

const mockFindUnique = (prisma as typeof prisma).standaloneWorkoutSession.findUnique as ReturnType<typeof vi.fn>
const mockDelete = (prisma as typeof prisma).standaloneWorkoutSession.delete as ReturnType<typeof vi.fn>
const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id = 'sws001') {
  mockGetRouterParam.mockReturnValue(id)
  return { path: `/api/standalone-workout-sessions/${id}`, context: { userId: 'user001' } }
}

const mockSession = { id: 'sws001', userId: 'user001' }

describe('DELETE /api/standalone-workout-sessions/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('deletes the session and returns success', async () => {
    mockFindUnique.mockResolvedValueOnce(mockSession)
    mockDelete.mockResolvedValueOnce(mockSession)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual({ success: true })
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'sws001' },
      select: { id: true, userId: true },
    })
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'sws001' } })
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

    expect(mockDelete).not.toHaveBeenCalled()
  })

  test('throws 404 when session belongs to a different user', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...mockSession, userId: 'other-user' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Not Found' })

    expect(mockDelete).not.toHaveBeenCalled()
  })

  test('throws 500 and logs when findUnique rejects', async () => {
    const dbError = new Error('connection reset')
    mockFindUnique.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to delete standalone workout session' })

    expect(logger.error).toHaveBeenCalledWith(
      { err: dbError, route: 'DELETE /api/standalone-workout-sessions/:id' },
      '[DELETE /api/standalone-workout-sessions/:id] Failed to delete session',
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
