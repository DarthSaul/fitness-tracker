/**
 * Tests for server/api/user-programs/[id]/sessions.get.ts
 *
 * Coverage strategy:
 *  - Happy path: returns the run's sessions in the shared { sessions } shape
 *  - No active-program requirement: works for an inactive program
 *  - Validation: 400 when id is missing/blank
 *  - Ownership: 404 when the program is missing or belongs to another user
 *  - Error propagation: 500 on unexpected error; H3 errors pass through
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './sessions.get'

const mockFindUnique = (prisma as typeof prisma).userProgram.findUnique as ReturnType<typeof vi.fn>
const mockFindFirst = (prisma as typeof prisma).userProgram.findFirst as ReturnType<typeof vi.fn>
const mockFindManySessions = (prisma as typeof prisma).workoutSession.findMany as ReturnType<typeof vi.fn>
const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id: string | undefined = 'up001') {
  mockGetRouterParam.mockReturnValue(id)
  return { path: `/api/user-programs/${id}/sessions`, context: { userId: 'user001' } }
}

type Handler = (e: ReturnType<typeof makeEvent>) => Promise<{ sessions: unknown[] }>

const mockInactiveProgram = {
  id: 'up001',
  userId: 'user001',
  programId: 'prog001',
  isActive: false,
  currentWeek: 12,
  currentDay: 4,
}

const mockSessions = [
  { id: 'ws001', userProgramId: 'up001', weekNumber: 1, dayNumber: 1, status: 'COMPLETED', _count: { completedSets: 12 } },
  { id: 'ws002', userProgramId: 'up001', weekNumber: 1, dayNumber: 2, status: 'COMPLETED', _count: { completedSets: 9 } },
]

describe('GET /api/user-programs/:id/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  // The manage view used to be reachable only through the ACTIVE program, which
  // left a user with no active program unable to reach their finished workouts.
  test('returns the sessions of an inactive program', async () => {
    mockFindUnique.mockResolvedValueOnce(mockInactiveProgram)
    mockFindManySessions.mockResolvedValueOnce(mockSessions)

    const event = makeEvent()
    const result = await (handler as unknown as Handler)(event)

    expect(result).toEqual({ sessions: mockSessions })
    expect(mockFindFirst).not.toHaveBeenCalled()
    expect(mockFindManySessions).toHaveBeenCalledWith({
      where: { userProgramId: 'up001' },
      orderBy: [{ weekNumber: 'asc' }, { dayNumber: 'asc' }, { startedAt: 'asc' }],
      include: { _count: { select: { completedSets: true } } },
    })
  })

  test('returns an empty list when the program has no sessions', async () => {
    mockFindUnique.mockResolvedValueOnce(mockInactiveProgram)
    mockFindManySessions.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as Handler)(event)

    expect(result.sessions).toEqual([])
  })

  test('throws 400 when id is missing', async () => {
    const event = makeEvent()
    mockGetRouterParam.mockReturnValue(undefined)

    await expect((handler as unknown as Handler)(event))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing user program ID' })
  })

  test('throws 400 when id is blank', async () => {
    const event = makeEvent('   ')

    await expect((handler as unknown as Handler)(event))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing user program ID' })
  })

  test('throws 404 when the program does not exist', async () => {
    mockFindUnique.mockResolvedValueOnce(null)

    const event = makeEvent('up999')
    await expect((handler as unknown as Handler)(event))
      .rejects.toMatchObject({ statusCode: 404, statusMessage: 'User program not found' })
    expect(mockFindManySessions).not.toHaveBeenCalled()
  })

  test('throws 404 when the program belongs to another user', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...mockInactiveProgram, userId: 'other-user' })

    const event = makeEvent()
    await expect((handler as unknown as Handler)(event))
      .rejects.toMatchObject({ statusCode: 404, statusMessage: 'User program not found' })
    expect(mockFindManySessions).not.toHaveBeenCalled()
  })

  test('throws 500 and logs on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockFindUnique.mockRejectedValueOnce(dbError)

    const event = makeEvent()
    await expect((handler as unknown as Handler)(event))
      .rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch sessions' })
    expect(logger.error).toHaveBeenCalledWith(
      { err: dbError, route: 'GET /api/user-programs/:id/sessions' },
      '[GET /api/user-programs/:id/sessions] Failed to fetch sessions',
    )
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = Object.assign(new Error('Unauthorized'), { statusCode: 401, statusMessage: 'Unauthorized' })
    mockFindUnique.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as Handler)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(401)
  })
})
