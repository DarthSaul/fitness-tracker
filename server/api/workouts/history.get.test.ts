import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './history.get'

const mockFindManySession = (prisma as typeof prisma).workoutSession.findMany as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>
const mockGetQuery = getQuery as ReturnType<typeof vi.fn>

function makeEvent() {
  return {
    path: '/api/workouts/history',
    context: { userId: 'user001' },
  }
}

const fakeSession = (id: string, completedAt: Date, programName = 'Strong Start') => ({
  id,
  userId: 'user001',
  userProgramId: 'up001',
  weekNumber: 1,
  dayNumber: 1,
  status: 'COMPLETED',
  startedAt: completedAt,
  completedAt,
  notes: null,
  userProgram: { program: { name: programName } },
  _count: { completedSets: 5 },
})

describe('GET /api/workouts/history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    mockGetQuery.mockReturnValue({})
  })

  test('returns shaped sessions with default limit when no query params', async () => {
    const session = fakeSession('ws001', new Date('2026-05-08T12:00:00Z'))
    mockFindManySession.mockResolvedValueOnce([session])

    const result = await (handler as unknown as (e: ReturnType<typeof makeEvent>) => Promise<{ sessions: unknown[] }>)(makeEvent())

    expect(result.sessions).toEqual([
      {
        id: 'ws001',
        userId: 'user001',
        userProgramId: 'up001',
        programName: 'Strong Start',
        weekNumber: 1,
        dayNumber: 1,
        status: 'COMPLETED',
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        notes: null,
        _count: { completedSets: 5 },
      },
    ])
    expect(mockFindManySession).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user001', status: 'COMPLETED', completedAt: { not: null } },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: 20,
    }))
  })

  test('clamps limit above MAX_LIMIT to 50', async () => {
    mockGetQuery.mockReturnValue({ limit: '999' })
    mockFindManySession.mockResolvedValueOnce([])

    await (handler as unknown as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent())

    expect(mockFindManySession).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }))
  })

  test('clamps limit below MIN_LIMIT to 1', async () => {
    mockGetQuery.mockReturnValue({ limit: '0' })
    mockFindManySession.mockResolvedValueOnce([])

    await (handler as unknown as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent())

    expect(mockFindManySession).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }))
  })

  test('rejects non-numeric limit with 400', async () => {
    mockGetQuery.mockReturnValue({ limit: 'abc' })

    await expect(
      (handler as unknown as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent()),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid limit' })
  })

  test('rejects limit with trailing garbage (regression: parseInt accepts "10foo")', async () => {
    mockGetQuery.mockReturnValue({ limit: '10foo' })

    await expect(
      (handler as unknown as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent()),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid limit' })
  })

  test('rejects fractional limit (regression: parseInt accepts "1.5")', async () => {
    mockGetQuery.mockReturnValue({ limit: '1.5' })

    await expect(
      (handler as unknown as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent()),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid limit' })
  })

  test('rejects array limit (regression: repeated ?limit= must not coerce)', async () => {
    mockGetQuery.mockReturnValue({ limit: ['10', '20'] })

    await expect(
      (handler as unknown as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent()),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid limit' })
  })

  test('rejects array before with 400', async () => {
    mockGetQuery.mockReturnValue({ before: ['2026-05-01T00:00:00Z', '2026-05-02T00:00:00Z'], beforeId: 'ws050' })

    await expect(
      (handler as unknown as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent()),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid before' })
  })

  test('rejects array beforeId with 400 (regression: array previously leaked to Prisma)', async () => {
    mockGetQuery.mockReturnValue({ before: '2026-05-01T00:00:00Z', beforeId: ['ws050', 'ws051'] })

    await expect(
      (handler as unknown as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent()),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid beforeId' })
  })

  test('applies composite before/beforeId cursor with (completedAt, id) tiebreaker', async () => {
    const before = '2026-05-01T00:00:00Z'
    const beforeId = 'ws050'
    mockGetQuery.mockReturnValue({ before, beforeId })
    mockFindManySession.mockResolvedValueOnce([])

    await (handler as unknown as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent())

    expect(mockFindManySession).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId: 'user001',
        status: 'COMPLETED',
        completedAt: { not: null },
        OR: [
          { completedAt: { lt: new Date(before) } },
          { completedAt: new Date(before), id: { lt: beforeId } },
        ],
      },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
    }))
  })

  test('rejects before without beforeId with 400', async () => {
    mockGetQuery.mockReturnValue({ before: '2026-05-01T00:00:00Z' })

    await expect(
      (handler as unknown as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent()),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'before and beforeId must be provided together' })
  })

  test('rejects beforeId without before with 400', async () => {
    mockGetQuery.mockReturnValue({ beforeId: 'ws050' })

    await expect(
      (handler as unknown as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent()),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'before and beforeId must be provided together' })
  })

  test('rejects unparseable before with 400', async () => {
    mockGetQuery.mockReturnValue({ before: 'not-a-date', beforeId: 'ws050' })

    await expect(
      (handler as unknown as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent()),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid before timestamp' })
  })

  test('returns empty array when user has no completed sessions', async () => {
    mockFindManySession.mockResolvedValueOnce([])

    const result = await (handler as unknown as (e: ReturnType<typeof makeEvent>) => Promise<{ sessions: unknown[] }>)(makeEvent())

    expect(result.sessions).toEqual([])
  })

  test('throws 500 on unexpected database error', async () => {
    const dbError = new Error('connection reset')
    mockFindManySession.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      (handler as unknown as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent()),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch workout history' })

    expect(consoleSpy).toHaveBeenCalledWith('[GET /api/workouts/history] Failed to fetch history', dbError)
    consoleSpy.mockRestore()
  })
})
