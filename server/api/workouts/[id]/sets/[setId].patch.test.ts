import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[setId].patch'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockFindUniqueSession = (prisma as typeof prisma).workoutSession.findUnique as ReturnType<typeof vi.fn>
const mockFindFirstCompletedSet = (prisma as typeof prisma).completedSet.findFirst as ReturnType<typeof vi.fn>
const mockUpdateCompletedSet = (prisma as typeof prisma).completedSet.update as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

/**
 * getRouterParam is called twice: first for 'id', then for 'setId'.
 * mockGetRouterParam is set up to return both values in call order.
 */
function makeEvent(id = 'ws001', setId = 'cs001') {
  mockGetRouterParam.mockReturnValueOnce(id).mockReturnValueOnce(setId)
  return {
    path: `/api/workouts/${id}/sets/${setId}`,
    context: { userId: 'user001' },
  }
}

const mockSession = {
  id: 'ws001',
  userId: 'user001',
  userProgramId: 'up001',
  status: 'IN_PROGRESS',
}

const mockCompletedSet = {
  id: 'cs001',
  workoutSessionId: 'ws001',
  exerciseSetId: 'es001',
  reps: 8,
  weight: 60,
  rpe: 7,
  notes: null,
  completedAt: new Date(),
}

describe('PATCH /api/workouts/:id/sets/:setId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    mockReadBody.mockResolvedValue({ reps: 10, weight: 65 })
  })

  test('updates a completed set and returns the updated record', async () => {
    const updatedSet = { ...mockCompletedSet, reps: 10, weight: 65 }
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce(mockCompletedSet)
    mockUpdateCompletedSet.mockResolvedValueOnce(updatedSet)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(updatedSet)
    expect(mockUpdateCompletedSet).toHaveBeenCalledWith({
      where: { id: 'cs001' },
      data: { reps: 10, weight: 65 },
    })
  })

  test('only includes defined fields in the update data', async () => {
    mockReadBody.mockResolvedValueOnce({ rpe: 8 })
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce(mockCompletedSet)
    mockUpdateCompletedSet.mockResolvedValueOnce({ ...mockCompletedSet, rpe: 8 })

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockUpdateCompletedSet).toHaveBeenCalledWith({
      where: { id: 'cs001' },
      data: { rpe: 8 },
    })
  })

  test('allows updating notes field', async () => {
    mockReadBody.mockResolvedValueOnce({ notes: 'felt strong today' })
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce(mockCompletedSet)
    mockUpdateCompletedSet.mockResolvedValueOnce({ ...mockCompletedSet, notes: 'felt strong today' })

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(expect.objectContaining({ notes: 'felt strong today' }))
  })

  test('throws 400 when session ID is missing', async () => {
    mockGetRouterParam.mockReturnValueOnce(undefined).mockReturnValueOnce('cs001')
    const event = { path: '/api/workouts/undefined/sets/cs001', context: { userId: 'user001' } }

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
  })

  test('throws 400 when set ID is missing', async () => {
    mockGetRouterParam.mockReturnValueOnce('ws001').mockReturnValueOnce(undefined)
    const event = { path: '/api/workouts/ws001/sets/undefined', context: { userId: 'user001' } }

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing set ID' })
  })

  test('throws 400 when reps is negative', async () => {
    mockReadBody.mockResolvedValueOnce({ reps: -1 })
    mockGetRouterParam.mockReturnValueOnce('ws001').mockReturnValueOnce('cs001')
    const event = { path: '/api/workouts/ws001/sets/cs001', context: { userId: 'user001' } }

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'reps must be a non-negative number' })
  })

  test('throws 400 when reps is Infinity', async () => {
    mockReadBody.mockResolvedValueOnce({ reps: Infinity })
    mockGetRouterParam.mockReturnValueOnce('ws001').mockReturnValueOnce('cs001')
    const event = { path: '/api/workouts/ws001/sets/cs001', context: { userId: 'user001' } }

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'reps must be a non-negative number' })
  })

  test('throws 400 when weight is negative', async () => {
    mockReadBody.mockResolvedValueOnce({ weight: -5 })
    mockGetRouterParam.mockReturnValueOnce('ws001').mockReturnValueOnce('cs001')
    const event = { path: '/api/workouts/ws001/sets/cs001', context: { userId: 'user001' } }

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'weight must be a non-negative number' })
  })

  test('throws 400 when weight is Infinity', async () => {
    mockReadBody.mockResolvedValueOnce({ weight: Infinity })
    mockGetRouterParam.mockReturnValueOnce('ws001').mockReturnValueOnce('cs001')
    const event = { path: '/api/workouts/ws001/sets/cs001', context: { userId: 'user001' } }

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'weight must be a non-negative number' })
  })

  test('throws 400 when rpe exceeds 10', async () => {
    mockReadBody.mockResolvedValueOnce({ rpe: 11 })
    mockGetRouterParam.mockReturnValueOnce('ws001').mockReturnValueOnce('cs001')
    const event = { path: '/api/workouts/ws001/sets/cs001', context: { userId: 'user001' } }

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'rpe must be between 0 and 10' })
  })

  test('throws 400 when rpe is negative', async () => {
    mockReadBody.mockResolvedValueOnce({ rpe: -1 })
    mockGetRouterParam.mockReturnValueOnce('ws001').mockReturnValueOnce('cs001')
    const event = { path: '/api/workouts/ws001/sets/cs001', context: { userId: 'user001' } }

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'rpe must be between 0 and 10' })
  })

  test('throws 400 when notes exceeds 500 characters', async () => {
    mockReadBody.mockResolvedValueOnce({ notes: 'x'.repeat(501) })
    mockGetRouterParam.mockReturnValueOnce('ws001').mockReturnValueOnce('cs001')
    const event = { path: '/api/workouts/ws001/sets/cs001', context: { userId: 'user001' } }

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'notes must be a string of 500 characters or less' })
  })

  test('throws 400 when notes is not a string', async () => {
    mockReadBody.mockResolvedValueOnce({ notes: 12345 })
    mockGetRouterParam.mockReturnValueOnce('ws001').mockReturnValueOnce('cs001')
    const event = { path: '/api/workouts/ws001/sets/cs001', context: { userId: 'user001' } }

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'notes must be a string of 500 characters or less' })
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

  test('throws 404 when completed set does not exist or does not belong to the session', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Completed set not found' })
  })

  test('queries completed set scoped to the session ID', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce(mockCompletedSet)
    mockUpdateCompletedSet.mockResolvedValueOnce(mockCompletedSet)

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockFindFirstCompletedSet).toHaveBeenCalledWith({
      where: { id: 'cs001', workoutSessionId: 'ws001' },
    })
  })

  test('throws 500 on unexpected database error and logs it', async () => {
    const dbError = new Error('connection reset')
    mockFindUniqueSession.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to update completed set' })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[PATCH /api/workouts/:id/sets/:setId] Failed to update completed set',
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

  test('allows updating a set on a completed session', async () => {
    const completedSession = { ...mockSession, status: 'COMPLETED' }
    const updatedSet = { ...mockCompletedSet, reps: 10 }
    mockFindUniqueSession.mockResolvedValueOnce(completedSession)
    mockFindFirstCompletedSet.mockResolvedValueOnce(mockCompletedSet)
    mockUpdateCompletedSet.mockResolvedValueOnce(updatedSet)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(updatedSet)
  })
})
