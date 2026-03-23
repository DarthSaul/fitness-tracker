import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[id].delete'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockFindUniqueSession = (prisma as typeof prisma).workoutSession.findUnique as ReturnType<typeof vi.fn>
const mockDeleteSession = (prisma as typeof prisma).workoutSession.delete as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id = 'ws001') {
  mockGetRouterParam.mockReturnValue(id)
  return {
    path: `/api/workouts/${id}`,
    context: { userId: 'user001' },
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

describe('DELETE /api/workouts/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('deletes an in-progress session and returns deleted: true', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockDeleteSession.mockResolvedValueOnce(mockSession)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ deleted: boolean }>)(event)

    expect(result).toEqual({ deleted: true })
    expect(mockDeleteSession).toHaveBeenCalledWith({ where: { id: 'ws001' } })
  })

  test('throws 400 when session ID is missing', async () => {
    const event = makeEvent(undefined as unknown as string)
    mockGetRouterParam.mockReturnValue(undefined)

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
  })

  test('throws 400 when session ID is whitespace only', async () => {
    const event = makeEvent('   ')
    mockGetRouterParam.mockReturnValue('   ')

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
  })

  test('throws 404 when session does not exist', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(null)

    const event = makeEvent('ws999')
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Session not found' })
  })

  test('throws 404 when session belongs to a different user', async () => {
    mockFindUniqueSession.mockResolvedValueOnce({ ...mockSession, userId: 'other-user' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Not Found' })
  })

  test('deletes an EDITING session and returns deleted: true', async () => {
    mockFindUniqueSession.mockResolvedValueOnce({ ...mockSession, status: 'EDITING' })
    mockDeleteSession.mockResolvedValueOnce({ ...mockSession, status: 'EDITING' })

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ deleted: boolean }>)(event)

    expect(result).toEqual({ deleted: true })
    expect(mockDeleteSession).toHaveBeenCalledWith({ where: { id: 'ws001' } })
  })

  test('throws 409 when session is already completed', async () => {
    mockFindUniqueSession.mockResolvedValueOnce({ ...mockSession, status: 'COMPLETED' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Cannot delete a completed session' })
  })

  test('does not call delete when session is already completed', async () => {
    mockFindUniqueSession.mockResolvedValueOnce({ ...mockSession, status: 'COMPLETED' })

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch(() => {})

    expect(mockDeleteSession).not.toHaveBeenCalled()
  })

  test('throws 500 on unexpected database error and logs it', async () => {
    const dbError = new Error('connection reset')
    mockFindUniqueSession.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to delete workout session' })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[DELETE /api/workouts/:id] Failed to delete workout session',
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
