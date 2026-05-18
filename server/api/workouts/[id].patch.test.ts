import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[id].patch'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockFindUniqueSession = (prisma as typeof prisma).workoutSession.findUnique as ReturnType<typeof vi.fn>
const mockUpdateSession = (prisma as typeof prisma).workoutSession.update as ReturnType<typeof vi.fn>
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
  notes: null,
}

describe('PATCH /api/workouts/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    mockReadBody.mockResolvedValue({ notes: 'Great session today' })
  })

  test('updates notes successfully and returns { id, notes }', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockUpdateSession.mockResolvedValueOnce({ ...mockSession, notes: 'Great session today' })

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ id: string; notes: string | null }>)(event)

    expect(result).toEqual({ id: 'ws001', notes: 'Great session today' })
    expect(mockUpdateSession).toHaveBeenCalledWith({
      where: { id: 'ws001' },
      data: { notes: 'Great session today' },
    })
  })

  test('throws 400 when notes is missing from body', async () => {
    mockReadBody.mockResolvedValueOnce({})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'notes must be a string' })
  })

  test('throws 400 when notes is not a string', async () => {
    mockReadBody.mockResolvedValueOnce({ notes: 42 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'notes must be a string' })
  })

  test('throws 400 when notes exceeds 2000 characters', async () => {
    mockReadBody.mockResolvedValueOnce({ notes: 'x'.repeat(2001) })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'notes must be 2000 characters or less' })
  })

  test('accepts notes at exactly 2000 characters', async () => {
    const longNotes = 'x'.repeat(2000)
    mockReadBody.mockResolvedValueOnce({ notes: longNotes })
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockUpdateSession.mockResolvedValueOnce({ ...mockSession, notes: longNotes })

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ id: string; notes: string | null }>)(event)

    expect(result.notes).toHaveLength(2000)
  })

  test('throws 400 when session ID is missing', async () => {
    const event = makeEvent(undefined as unknown as string)
    mockGetRouterParam.mockReturnValue(undefined)

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
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
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to update workout session' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'PATCH /api/workouts/:id' }, '[PATCH /api/workouts/:id] Failed to update workout session')
    consoleSpy.mockRestore()
  })
})
