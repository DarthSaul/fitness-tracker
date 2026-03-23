import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './sessions.get'

const mockFindFirstUserProgram = (prisma as typeof prisma).userProgram.findFirst as ReturnType<typeof vi.fn>
const mockFindManySessions = (prisma as typeof prisma).workoutSession.findMany as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(userId = 'user001') {
  return {
    path: '/api/user-programs/active/sessions',
    context: { userId },
  }
}

const mockActiveProgram = {
  id: 'up001',
  userId: 'user001',
  programId: 'prog001',
  isActive: true,
  currentWeek: 1,
  currentDay: 2,
}

const mockSessions = [
  {
    id: 'ws001',
    userProgramId: 'up001',
    weekNumber: 1,
    dayNumber: 1,
    status: 'COMPLETED',
    _count: { completedSets: 12 },
  },
  {
    id: 'ws002',
    userProgramId: 'up001',
    weekNumber: 1,
    dayNumber: 2,
    status: 'IN_PROGRESS',
    _count: { completedSets: 5 },
  },
]

describe('GET /api/user-programs/active/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('returns all sessions for the active program', async () => {
    mockFindFirstUserProgram.mockResolvedValueOnce(mockActiveProgram)
    mockFindManySessions.mockResolvedValueOnce(mockSessions)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ sessions: unknown[] }>)(event)

    expect(result.sessions).toEqual(mockSessions)
  })

  test('queries only the active program for the authenticated user', async () => {
    mockFindFirstUserProgram.mockResolvedValueOnce(mockActiveProgram)
    mockFindManySessions.mockResolvedValueOnce([])

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockFindFirstUserProgram).toHaveBeenCalledWith({
      where: { userId: 'user001', isActive: true },
    })
  })

  test('queries sessions scoped to the active program ID', async () => {
    mockFindFirstUserProgram.mockResolvedValueOnce(mockActiveProgram)
    mockFindManySessions.mockResolvedValueOnce(mockSessions)

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockFindManySessions).toHaveBeenCalledWith({
      where: { userProgramId: 'up001' },
      orderBy: [{ weekNumber: 'asc' }, { dayNumber: 'asc' }],
      include: {
        _count: { select: { completedSets: true } },
      },
    })
  })

  test('returns empty sessions array when active program has no sessions', async () => {
    mockFindFirstUserProgram.mockResolvedValueOnce(mockActiveProgram)
    mockFindManySessions.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ sessions: unknown[] }>)(event)

    expect(result.sessions).toEqual([])
  })

  test('throws 404 when user has no active program', async () => {
    mockFindFirstUserProgram.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'No active program' })
  })

  test('does not query sessions when no active program is found', async () => {
    mockFindFirstUserProgram.mockResolvedValueOnce(null)

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch(() => {})

    expect(mockFindManySessions).not.toHaveBeenCalled()
  })

  test('sessions are ordered by weekNumber then dayNumber ascending', async () => {
    mockFindFirstUserProgram.mockResolvedValueOnce(mockActiveProgram)
    mockFindManySessions.mockResolvedValueOnce(mockSessions)

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    const callArgs = mockFindManySessions.mock.calls[0]![0] as { orderBy: unknown[] }
    expect(callArgs.orderBy).toEqual([{ weekNumber: 'asc' }, { dayNumber: 'asc' }])
  })

  test('includes completed set counts in the response', async () => {
    mockFindFirstUserProgram.mockResolvedValueOnce(mockActiveProgram)
    mockFindManySessions.mockResolvedValueOnce(mockSessions)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ sessions: typeof mockSessions }>)(event)

    expect(result.sessions[0]!._count.completedSets).toBe(12)
    expect(result.sessions[1]!._count.completedSets).toBe(5)
  })

  test('throws 500 on unexpected database error and logs it', async () => {
    const dbError = new Error('connection reset')
    mockFindFirstUserProgram.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch sessions' })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[GET /api/user-programs/active/sessions] Failed to fetch sessions',
      dbError,
    )
    consoleSpy.mockRestore()
  })

  test('throws 500 when session query fails after finding active program', async () => {
    const dbError = new Error('timeout')
    mockFindFirstUserProgram.mockResolvedValueOnce(mockActiveProgram)
    mockFindManySessions.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch sessions' })

    consoleSpy.mockRestore()
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('No active program') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'No active program'
    mockFindFirstUserProgram.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(404)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
