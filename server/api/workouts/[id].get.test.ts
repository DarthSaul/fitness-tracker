import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[id].get'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockFindUniqueSession = (prisma as typeof prisma).workoutSession.findUnique as ReturnType<typeof vi.fn>
const mockFindFirstDay = (prisma as typeof prisma).programDay.findFirst as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id = 'ws001') {
  mockGetRouterParam.mockReturnValue(id)
  return {
    path: `/api/workouts/${id}`,
    context: { userId: 'user001' },
  }
}

const mockUserProgram = {
  id: 'up001',
  programId: 'prog001',
}

const mockSession = {
  id: 'ws001',
  userId: 'user001',
  userProgramId: 'up001',
  weekNumber: 1,
  dayNumber: 2,
  status: 'IN_PROGRESS',
  completedSets: [],
  userProgram: mockUserProgram,
}

const mockDay = {
  id: 'day001',
  dayNumber: 2,
  exerciseGroups: [],
}

describe('GET /api/workouts/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('returns session and day template on success', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstDay.mockResolvedValueOnce(mockDay)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ session: unknown; day: unknown }>)(event)

    expect(result.session).toEqual(mockSession)
    expect(result.day).toEqual(mockDay)
  })

  test('queries session with completedSets and userProgram includes', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstDay.mockResolvedValueOnce(mockDay)

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockFindUniqueSession).toHaveBeenCalledWith({
      where: { id: 'ws001' },
      include: {
        completedSets: true,
        userProgram: true,
      },
    })
  })

  test('queries program day using session position and program ID', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstDay.mockResolvedValueOnce(mockDay)

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockFindFirstDay).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          programWeek: {
            programId: 'prog001',
            weekNumber: 1,
          },
          dayNumber: 2,
        },
      }),
    )
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

  test('throws 500 when program day is not found for session position', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockFindFirstDay.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Program day not found for session position' })
  })

  test('throws 500 on unexpected database error and logs it', async () => {
    const dbError = new Error('connection reset')
    mockFindUniqueSession.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch workout session' })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[GET /api/workouts/:id] Failed to fetch workout session',
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

  test('works for completed sessions as well as in-progress ones', async () => {
    const completedSession = { ...mockSession, status: 'COMPLETED', completedAt: new Date() }
    mockFindUniqueSession.mockResolvedValueOnce(completedSession)
    mockFindFirstDay.mockResolvedValueOnce(mockDay)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ session: unknown; day: unknown }>)(event)

    expect(result.session).toEqual(completedSession)
    expect(result.day).toEqual(mockDay)
  })
})
