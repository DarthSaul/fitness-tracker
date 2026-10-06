/**
 * Tests for server/api/scheduled-workouts/index.get.ts
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.get'

const mockFindUserProgram = (prisma as typeof prisma).userProgram.findUnique as ReturnType<typeof vi.fn>
const mockFindMany = (prisma as typeof prisma).scheduledWorkout.findMany as ReturnType<typeof vi.fn>
const mockGetQuery = getQuery as ReturnType<typeof vi.fn>

const mockScheduled = [
  { id: 'sw1', userProgramId: 'up1', weekNumber: 1, dayNumber: 1, scheduledDate: new Date('2026-10-06T00:00:00.000Z') },
  { id: 'sw2', userProgramId: 'up1', weekNumber: 1, dayNumber: 2, scheduledDate: new Date('2026-10-08T00:00:00.000Z') },
]

function call(query: Record<string, unknown> = { userProgramId: 'up1' }, userId: string | null = 'user001') {
  mockGetQuery.mockReturnValue(query)
  const event = { path: '/api/scheduled-workouts', context: { userId: userId ?? undefined } }
  return (handler as unknown as (e: typeof event) => Promise<Record<string, unknown>>)(event)
}

describe('GET /api/scheduled-workouts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUserProgram.mockResolvedValue({ userId: 'user001' })
    mockFindMany.mockResolvedValue(mockScheduled)
  })

  test('returns the program\'s scheduled workouts ordered by date', async () => {
    expect(await call()).toEqual({ scheduledWorkouts: mockScheduled })
    expect(mockFindUserProgram).toHaveBeenCalledWith({ where: { id: 'up1' }, select: { userId: true } })
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userProgramId: 'up1' },
      orderBy: { scheduledDate: 'asc' },
    })
  })

  test('filters by both from and to when given', async () => {
    await call({ userProgramId: 'up1', from: '2026-10-01', to: '2026-10-31' })

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        userProgramId: 'up1',
        scheduledDate: { gte: new Date('2026-10-01'), lte: new Date('2026-10-31') },
      },
      orderBy: { scheduledDate: 'asc' },
    })
  })

  test('filters by from alone', async () => {
    await call({ userProgramId: 'up1', from: '2026-10-01' })

    expect(mockFindMany.mock.calls[0]![0].where.scheduledDate).toEqual({ gte: new Date('2026-10-01') })
  })

  test('filters by to alone', async () => {
    await call({ userProgramId: 'up1', to: '2026-10-31' })

    expect(mockFindMany.mock.calls[0]![0].where.scheduledDate).toEqual({ lte: new Date('2026-10-31') })
  })

  test('returns an empty list when nothing is scheduled', async () => {
    mockFindMany.mockResolvedValueOnce([])

    expect(await call()).toEqual({ scheduledWorkouts: [] })
  })

  test('401 when unauthenticated, before any query', async () => {
    await expect(call({ userProgramId: 'up1' }, null)).rejects.toMatchObject({ statusCode: 401 })
    expect(mockFindUserProgram).not.toHaveBeenCalled()
  })

  test('400 when userProgramId is missing', async () => {
    await expect(call({})).rejects.toMatchObject({ statusCode: 400, statusMessage: 'userProgramId is required' })
    expect(mockFindUserProgram).not.toHaveBeenCalled()
  })

  test('404 when the user program does not exist', async () => {
    mockFindUserProgram.mockResolvedValueOnce(null)

    await expect(call()).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User program not found' })
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  test('403 when the program belongs to another user, without listing its workouts', async () => {
    mockFindUserProgram.mockResolvedValueOnce({ userId: 'someone-else' })

    await expect(call()).rejects.toMatchObject({ statusCode: 403, statusMessage: 'Forbidden' })
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  test('400 for an unparseable from date', async () => {
    await expect(call({ userProgramId: 'up1', from: 'not-a-date' })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid "from" date',
    })
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  test('400 for an unparseable to date', async () => {
    await expect(call({ userProgramId: 'up1', from: '2026-10-01', to: 'nope' })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid "to" date',
    })
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  test('500 with a structured log on an unexpected database error', async () => {
    mockFindMany.mockRejectedValueOnce(new Error('connection reset'))

    await expect(call()).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch scheduled workouts' })
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ route: 'GET /api/scheduled-workouts' }),
      expect.any(String),
    )
  })

  test('rethrows an error that already carries a status code, without logging it', async () => {
    mockFindMany.mockRejectedValueOnce(Object.assign(new Error('rate limited'), { statusCode: 429 }))

    await expect(call()).rejects.toMatchObject({ statusCode: 429 })
    expect(logger.error).not.toHaveBeenCalled()
  })
})
