import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[coreSetId].delete'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockFindUniqueSession = (prisma as typeof prisma).workoutSession.findUnique as ReturnType<typeof vi.fn>
const mockFindFirstCoreSet = (prisma as typeof prisma).completedCoreSet.findFirst as ReturnType<typeof vi.fn>
const mockDeleteCoreSet = (prisma as typeof prisma).completedCoreSet.delete as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

/**
 * getRouterParam is called twice: first for 'id', then for 'coreSetId'.
 * mockGetRouterParam is set up to return both values in call order.
 */
function makeEvent(id = 'ws001', coreSetId = 'ccs001') {
  mockGetRouterParam.mockReturnValueOnce(id).mockReturnValueOnce(coreSetId)
  return {
    path: `/api/workouts/${id}/core-sets/${coreSetId}`,
    context: { userId: 'user001' },
  }
}

const mockSession = {
  id: 'ws001',
  userId: 'user001',
  userProgramId: 'up001',
  status: 'IN_PROGRESS',
  coreSectionAddedAt: new Date('2026-07-01T10:00:00Z'),
}

const mockCoreSet = {
  id: 'ccs001',
  workoutSessionId: 'ws001',
  exerciseId: 'ex101',
  durationSeconds: 60,
  reps: null,
  notes: null,
  completedAt: new Date(),
}

describe('DELETE /api/workouts/:id/core-sets/:coreSetId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('deletes the core set and returns { deleted: true }', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCoreSet.mockResolvedValueOnce(mockCoreSet)
    mockDeleteCoreSet.mockResolvedValueOnce(mockCoreSet)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual({ deleted: true })
    expect(mockFindFirstCoreSet).toHaveBeenCalledWith({
      where: { id: 'ccs001', workoutSessionId: 'ws001' },
    })
    expect(mockDeleteCoreSet).toHaveBeenCalledWith({ where: { id: 'ccs001' } })
  })

  test('throws 400 when session id is missing', async () => {
    mockGetRouterParam.mockReset()
    mockGetRouterParam.mockReturnValueOnce(undefined).mockReturnValueOnce('ccs001')
    const event = { path: '/api/workouts//core-sets/ccs001', context: { userId: 'user001' } }

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
  })

  test('throws 400 when core set id is missing', async () => {
    mockGetRouterParam.mockReset()
    mockGetRouterParam.mockReturnValueOnce('ws001').mockReturnValueOnce(undefined)
    const event = { path: '/api/workouts/ws001/core-sets/', context: { userId: 'user001' } }

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing core set ID' })
  })

  test('throws 404 when session not found', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Session not found' })
  })

  test('throws 404 when session belongs to another user', async () => {
    mockFindUniqueSession.mockResolvedValueOnce({ ...mockSession, userId: 'other-user' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Not Found' })
  })

  test('throws 404 when core set does not belong to this session', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCoreSet.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Core set not found' })
    expect(mockDeleteCoreSet).not.toHaveBeenCalled()
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockFindUniqueSession.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to delete core set' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'DELETE /api/workouts/:id/core-sets/:coreSetId' }, '[DELETE /api/workouts/:id/core-sets/:coreSetId] Failed to delete core set')
    consoleSpy.mockRestore()
  })
})
