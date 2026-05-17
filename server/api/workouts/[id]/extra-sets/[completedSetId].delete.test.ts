import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[completedSetId].delete'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockFindUniqueSession = (prisma as typeof prisma).workoutSession.findUnique as ReturnType<typeof vi.fn>
const mockFindFirstCompletedSet = (prisma as typeof prisma).completedSet.findFirst as ReturnType<typeof vi.fn>
const mockDeleteCompletedSet = (prisma as typeof prisma).completedSet.delete as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id = 'ws001', completedSetId = 'cs001') {
  mockGetRouterParam.mockImplementation((_event: unknown, param: string) => {
    if (param === 'id') return id
    if (param === 'completedSetId') return completedSetId
    return undefined
  })
  return {
    path: `/api/workouts/${id}/extra-sets/${completedSetId}`,
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

const mockExtraSet = {
  id: 'cs001',
  workoutSessionId: 'ws001',
  exerciseSetId: null,
  programExerciseId: 'pe001',
  reps: 10,
  weight: 70,
  completedAt: new Date(),
}

describe('DELETE /api/workouts/:id/extra-sets/:completedSetId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('deletes extra set and returns { deleted: true }', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce(mockExtraSet)
    mockDeleteCompletedSet.mockResolvedValueOnce(mockExtraSet)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ deleted: boolean }>)(event)

    expect(result).toEqual({ deleted: true })
    expect(mockDeleteCompletedSet).toHaveBeenCalledWith({ where: { id: 'cs001' } })
  })

  test('queries completedSet with exerciseSetId: null filter (extra sets only)', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce(mockExtraSet)
    mockDeleteCompletedSet.mockResolvedValueOnce(mockExtraSet)

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockFindFirstCompletedSet).toHaveBeenCalledWith({
      where: { id: 'cs001', workoutSessionId: 'ws001', exerciseSetId: null },
    })
  })

  test('throws 400 when session ID is missing', async () => {
    const event = makeEvent()
    mockGetRouterParam.mockImplementation((_event: unknown, param: string) => {
      if (param === 'id') return undefined
      if (param === 'completedSetId') return 'cs001'
      return undefined
    })

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
  })

  test('throws 400 when completedSetId is missing', async () => {
    const event = makeEvent()
    mockGetRouterParam.mockImplementation((_event: unknown, param: string) => {
      if (param === 'id') return 'ws001'
      if (param === 'completedSetId') return undefined
      return undefined
    })

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing completed set ID' })
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
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Session not found' })
  })

  test('throws 404 when completedSet not found (returns null for non-extra sets or missing sets)', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Extra set not found' })
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

  test('wraps unknown errors as 500 and logs them', async () => {
    const dbError = new Error('connection reset')
    mockFindUniqueSession.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to delete extra set' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'DELETE /api/workouts/:id/extra-sets/:completedSetId' }, '[DELETE /api/workouts/:id/extra-sets/:completedSetId] Failed to delete extra set')
    consoleSpy.mockRestore()
  })
})
