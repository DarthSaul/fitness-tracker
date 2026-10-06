/**
 * Tests for server/api/weekly-goal/index.get.ts (docs/weekly-goal/SPEC-weekly-goal.md)
 *
 * weekBounds and completedWorkoutsBetween are the real helpers (vitest.setup.ts),
 * so the assertions pin the actual week edges handed to the two counts.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

import handler from './index.get'

const mockFindUniqueUser = (prisma as typeof prisma).user.findUnique as ReturnType<typeof vi.fn>
const mockProgramCount = (prisma as typeof prisma).workoutSession.count as ReturnType<typeof vi.fn>
const mockStandaloneCount = (prisma as typeof prisma).standaloneWorkoutSession.count as ReturnType<typeof vi.fn>
const mockGetQuery = getQuery as ReturnType<typeof vi.fn>

// Wednesday 2026-10-07, 13:00 CDT.
const NOW = new Date('2026-10-07T18:00:00.000Z')

const storedUser = {
  weeklyWorkoutGoalEnabled: true,
  weeklyWorkoutGoal: 4,
  weekStartDay: 'SUNDAY',
  timezone: 'America/Chicago',
}

function call(query: Record<string, unknown> = {}) {
  mockGetQuery.mockReturnValue(query)
  const event = { path: '/api/weekly-goal', context: { userId: 'user001' } }
  return (handler as unknown as (e: typeof event) => Promise<Record<string, unknown>>)(event)
}

/** The completedAt window both counts were asked for. */
function countedWindow() {
  const { completedAt } = mockProgramCount.mock.calls[0]![0].where
  expect(mockStandaloneCount.mock.calls[0]![0].where.completedAt).toEqual(completedAt)
  return { start: completedAt.gte.toISOString(), end: completedAt.lt.toISOString() }
}

describe('GET /api/weekly-goal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    mockFindUniqueUser.mockResolvedValue(storedUser)
    mockProgramCount.mockResolvedValue(1)
    mockStandaloneCount.mockResolvedValue(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('returns the goal and this week\'s completed count, Sunday to Sunday in the stored zone', async () => {
    mockProgramCount.mockResolvedValueOnce(2)
    mockStandaloneCount.mockResolvedValueOnce(1)

    expect(await call()).toEqual({
      enabled: true,
      goal: 4,
      completedThisWeek: 3,
      weekStartDay: 'SUNDAY',
      weekStart: '2026-10-04T05:00:00.000Z',
      weekEnd: '2026-10-11T05:00:00.000Z',
      timeZone: 'America/Chicago',
    })
    expect(mockFindUniqueUser).toHaveBeenCalledWith({
      where: { id: 'user001' },
      select: { weeklyWorkoutGoalEnabled: true, weeklyWorkoutGoal: true, weekStartDay: true, timezone: true },
    })
  })

  test('counts only COMPLETED sessions of this user, by the completedAt on their record', async () => {
    await call()
    const where = mockProgramCount.mock.calls[0]![0].where
    expect(where).toMatchObject({ userId: 'user001', status: 'COMPLETED' })
    // completedAt is what a date edit or a backdate writes, so either moves the
    // workout to that date's week: anything before weekStart is out.
    expect(where.completedAt.gte.toISOString()).toBe('2026-10-04T05:00:00.000Z')
    expect(where.completedAt.lt.toISOString()).toBe('2026-10-11T05:00:00.000Z')
  })

  test('a disabled goal still returns the count; the client decides whether to show the card', async () => {
    mockFindUniqueUser.mockResolvedValueOnce({ ...storedUser, weeklyWorkoutGoalEnabled: false })

    expect(await call()).toMatchObject({ enabled: false, goal: 4, completedThisWeek: 1 })
  })

  test('weekStartDay moves the window: a Monday start begins on Monday', async () => {
    mockFindUniqueUser.mockResolvedValueOnce({ ...storedUser, weekStartDay: 'MONDAY' })

    expect(await call()).toMatchObject({ weekStartDay: 'MONDAY', weekStart: '2026-10-05T05:00:00.000Z' })
    expect(countedWindow()).toEqual({ start: '2026-10-05T05:00:00.000Z', end: '2026-10-12T05:00:00.000Z' })
  })

  describe('time zone', () => {
    test('the ?timeZone= param wins over the stored zone', async () => {
      expect(await call({ timeZone: 'Asia/Tokyo' })).toMatchObject({ timeZone: 'Asia/Tokyo', weekStart: '2026-10-03T15:00:00.000Z' })
    })

    test('UTC when nothing is stored', async () => {
      mockFindUniqueUser.mockResolvedValueOnce({ ...storedUser, timezone: null })

      expect(await call()).toMatchObject({ timeZone: 'UTC', weekStart: '2026-10-04T00:00:00.000Z' })
    })

    test('UTC when the stored zone is one this runtime does not know', async () => {
      mockFindUniqueUser.mockResolvedValueOnce({ ...storedUser, timezone: 'Mars/Olympus_Mons' })

      expect(await call()).toMatchObject({ timeZone: 'UTC' })
    })

    test('400 for an invalid param, before any query', async () => {
      await expect(call({ timeZone: '-05:00' })).rejects.toMatchObject({ statusCode: 400 })
      expect(mockFindUniqueUser).not.toHaveBeenCalled()
    })
  })

  test('404 when the user record is missing', async () => {
    mockFindUniqueUser.mockResolvedValueOnce(null)

    await expect(call()).rejects.toMatchObject({ statusCode: 404 })
    expect(mockProgramCount).not.toHaveBeenCalled()
  })

  test('500 with a structured log on an unexpected error', async () => {
    mockProgramCount.mockRejectedValueOnce(new Error('connection reset'))

    await expect(call()).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch weekly goal' })
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ route: 'GET /api/weekly-goal' }),
      expect.any(String),
    )
  })
})
