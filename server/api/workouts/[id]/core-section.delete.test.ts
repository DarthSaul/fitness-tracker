import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './core-section.delete'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockTransaction = (prisma as typeof prisma).$transaction as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

// Transaction-scoped mocks
const txMocks = {
  findUniqueSession: vi.fn(),
  updateSession: vi.fn(),
  deleteManyCoreSets: vi.fn(),
}

function makeEvent(id = 'ws001') {
  mockGetRouterParam.mockReturnValue(id)
  return {
    path: `/api/workouts/${id}/core-section`,
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
  coreSectionAddedAt: new Date('2026-07-01T10:00:00Z'),
}

describe('DELETE /api/workouts/:id/core-section', () => {
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
        workoutSession: { findUnique: txMocks.findUniqueSession, update: txMocks.updateSession },
        completedCoreSet: { deleteMany: txMocks.deleteManyCoreSets },
      }
      return fn(tx)
    })
  })

  test('removes the core section and its logged sets', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(mockSession)
    txMocks.deleteManyCoreSets.mockResolvedValueOnce({ count: 3 })
    txMocks.updateSession.mockResolvedValueOnce({ ...mockSession, coreSectionAddedAt: null })

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual({ deleted: true })
    expect(txMocks.deleteManyCoreSets).toHaveBeenCalledWith({
      where: { workoutSessionId: 'ws001' },
    })
    expect(txMocks.updateSession).toHaveBeenCalledWith({
      where: { id: 'ws001' },
      data: { coreSectionAddedAt: null },
    })
  })

  test('works on a completed session (no status gate)', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce({ ...mockSession, status: 'COMPLETED' })
    txMocks.deleteManyCoreSets.mockResolvedValueOnce({ count: 0 })
    txMocks.updateSession.mockResolvedValueOnce({ ...mockSession, status: 'COMPLETED', coreSectionAddedAt: null })

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual({ deleted: true })
  })

  test('throws 400 when session id is missing', async () => {
    const event = makeEvent(undefined as unknown as string)
    mockGetRouterParam.mockReturnValue(undefined)

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
  })

  test('throws 404 when session not found', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Session not found' })
  })

  test('throws 404 when session belongs to another user', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce({ ...mockSession, userId: 'other-user' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Not Found' })
  })

  test('throws 404 when no core section has been added', async () => {
    txMocks.findUniqueSession.mockResolvedValueOnce({ ...mockSession, coreSectionAddedAt: null })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Core section not found' })
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    txMocks.findUniqueSession.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to remove core section' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'DELETE /api/workouts/:id/core-section' }, '[DELETE /api/workouts/:id/core-section] Failed to remove core section')
    consoleSpy.mockRestore()
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('Session not found') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'Session not found'
    txMocks.findUniqueSession.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(404)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
