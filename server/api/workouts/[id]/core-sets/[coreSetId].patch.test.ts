import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[coreSetId].patch'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockFindUniqueSession = (prisma as typeof prisma).workoutSession.findUnique as ReturnType<typeof vi.fn>
const mockFindFirstCoreSet = (prisma as typeof prisma).completedCoreSet.findFirst as ReturnType<typeof vi.fn>
const mockUpdateCoreSet = (prisma as typeof prisma).completedCoreSet.update as ReturnType<typeof vi.fn>
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

describe('PATCH /api/workouts/:id/core-sets/:coreSetId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    mockReadBody.mockResolvedValue({ durationSeconds: 90 })
  })

  test('updates durationSeconds and returns the updated core set', async () => {
    const updated = { ...mockCoreSet, durationSeconds: 90, exercise: { id: 'ex101', name: 'Plank' } }
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCoreSet.mockResolvedValueOnce(mockCoreSet)
    mockUpdateCoreSet.mockResolvedValueOnce(updated)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(updated)
    expect(mockUpdateCoreSet).toHaveBeenCalledWith({
      where: { id: 'ccs001' },
      data: { durationSeconds: 90 },
      include: { exercise: { select: { id: true, name: true } } },
    })
  })

  test('updates reps only', async () => {
    mockReadBody.mockResolvedValueOnce({ reps: 25 })
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCoreSet.mockResolvedValueOnce(mockCoreSet)
    mockUpdateCoreSet.mockResolvedValueOnce({ ...mockCoreSet, reps: 25 })

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockUpdateCoreSet).toHaveBeenCalledWith({
      where: { id: 'ccs001' },
      data: { reps: 25 },
      include: { exercise: { select: { id: true, name: true } } },
    })
  })

  test('updates notes only', async () => {
    mockReadBody.mockResolvedValueOnce({ notes: 'felt strong' })
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCoreSet.mockResolvedValueOnce(mockCoreSet)
    mockUpdateCoreSet.mockResolvedValueOnce({ ...mockCoreSet, notes: 'felt strong' })

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockUpdateCoreSet).toHaveBeenCalledWith({
      where: { id: 'ccs001' },
      data: { notes: 'felt strong' },
      include: { exercise: { select: { id: true, name: true } } },
    })
  })

  test('allows nulling durationSeconds when reps remains on the row', async () => {
    mockReadBody.mockResolvedValueOnce({ durationSeconds: null })
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCoreSet.mockResolvedValueOnce({ ...mockCoreSet, durationSeconds: 60, reps: 20 })
    mockUpdateCoreSet.mockResolvedValueOnce({ ...mockCoreSet, durationSeconds: null, reps: 20 })

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockUpdateCoreSet).toHaveBeenCalledWith({
      where: { id: 'ccs001' },
      data: { durationSeconds: null },
      include: { exercise: { select: { id: true, name: true } } },
    })
  })

  test('throws 400 when the update would null both durationSeconds and reps', async () => {
    mockReadBody.mockResolvedValueOnce({ durationSeconds: null })
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    // Row only has a duration — nulling it would leave neither value
    mockFindFirstCoreSet.mockResolvedValueOnce({ ...mockCoreSet, durationSeconds: 60, reps: null })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'At least one of durationSeconds or reps is required' })
    expect(mockUpdateCoreSet).not.toHaveBeenCalled()
  })

  test('works on a completed session (no status gate)', async () => {
    mockFindUniqueSession.mockResolvedValueOnce({ ...mockSession, status: 'COMPLETED' })
    mockFindFirstCoreSet.mockResolvedValueOnce(mockCoreSet)
    mockUpdateCoreSet.mockResolvedValueOnce({ ...mockCoreSet, durationSeconds: 90 })

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual({ ...mockCoreSet, durationSeconds: 90 })
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

  test('throws 400 when durationSeconds is invalid', async () => {
    mockReadBody.mockResolvedValueOnce({ durationSeconds: -5 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'durationSeconds must be a non-negative integer' })
  })

  test('throws 400 when reps is invalid', async () => {
    mockReadBody.mockResolvedValueOnce({ reps: 3.7 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'reps must be a non-negative integer' })
  })

  test('throws 400 when notes exceeds 500 characters', async () => {
    mockReadBody.mockResolvedValueOnce({ notes: 'x'.repeat(501) })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'notes must be a string of 500 characters or less' })
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
    expect(mockFindFirstCoreSet).toHaveBeenCalledWith({
      where: { id: 'ccs001', workoutSessionId: 'ws001' },
    })
  })

  test('maps a concurrent delete (P2025) to 404 instead of 500', async () => {
    mockReadBody.mockResolvedValueOnce({ durationSeconds: 90 })
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCoreSet.mockResolvedValueOnce(mockCoreSet)
    const p2025Error = new Error('Record to update not found') as Error & { code: string }
    p2025Error.code = 'P2025'
    mockUpdateCoreSet.mockRejectedValueOnce(p2025Error)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Core set not found' })
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockFindUniqueSession.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to update core set' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'PATCH /api/workouts/:id/core-sets/:coreSetId' }, '[PATCH /api/workouts/:id/core-sets/:coreSetId] Failed to update core set')
    consoleSpy.mockRestore()
  })
})
