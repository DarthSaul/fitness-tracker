/**
 * Tests for server/api/history.get.ts
 *
 * Coverage strategy:
 *  - Merged happy path: program + standalone sessions interleaved by
 *    completedAt DESC, exact where/orderBy/take/include shape per table,
 *    rows carry a type discriminator with per-type shaping (program rows
 *    flattened with programName; standalone rows with workout summary)
 *  - Tiebreak: rows sharing a completedAt are ordered by id DESC across
 *    both tables
 *  - Limit: merged result is trimmed to `limit` even when each table
 *    returns `limit` rows
 *  - Type filter: type=program queries only WorkoutSession; type=standalone
 *    queries only StandaloneWorkoutSession; 400 on any other value
 *  - Pagination boundaries: clamps limit above MAX_LIMIT (50) and below
 *    MIN_LIMIT (1); 400 on non-digit limit
 *  - Cursor: composite (completedAt, id) cursor applied to BOTH tables when
 *    before+beforeId are provided; 400 when only one of the pair is present;
 *    400 on an unparseable before timestamp
 *  - Auth guard: 401 when event.context.userId is unset (no queries run)
 *  - Error propagation: 500 when a findMany rejects, logs via logger.error
 *  - H3 error pass-through: re-throws an H3 error without wrapping it as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './history.get'

const mockProgramFindMany = (prisma as typeof prisma).workoutSession.findMany as ReturnType<typeof vi.fn>
const mockStandaloneFindMany = (prisma as typeof prisma).standaloneWorkoutSession.findMany as ReturnType<typeof vi.fn>
const mockGetQuery = getQuery as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent() {
  return { path: '/api/history', context: { userId: 'user001' } }
}

const programRow = {
  id: 'ws002',
  userId: 'user001',
  userProgramId: 'up001',
  weekNumber: 2,
  dayNumber: 3,
  status: 'COMPLETED',
  startedAt: new Date('2026-07-20T11:00:00Z'),
  completedAt: new Date('2026-07-20T12:00:00Z'),
  notes: null,
  _count: { completedSets: 12 },
  userProgram: { program: { name: 'Brick House' } },
}

const shapedProgramRow = {
  type: 'PROGRAM',
  id: 'ws002',
  userId: 'user001',
  userProgramId: 'up001',
  programName: 'Brick House',
  weekNumber: 2,
  dayNumber: 3,
  status: 'COMPLETED',
  startedAt: programRow.startedAt,
  completedAt: programRow.completedAt,
  notes: null,
  _count: { completedSets: 12 },
}

const standaloneRow = {
  id: 'sws001',
  userId: 'user001',
  standaloneWorkoutId: 'sw001',
  status: 'COMPLETED',
  startedAt: new Date('2026-07-21T11:00:00Z'),
  completedAt: new Date('2026-07-21T12:00:00Z'),
  notes: null,
  _count: { completedSets: 5 },
  standaloneWorkout: { id: 'sw001', category: 'Upper Push', order: 1, name: 'Push Day' },
}

const shapedStandaloneRow = {
  type: 'STANDALONE',
  id: 'sws001',
  userId: 'user001',
  standaloneWorkoutId: 'sw001',
  standaloneWorkout: { id: 'sw001', category: 'Upper Push', order: 1, name: 'Push Day' },
  status: 'COMPLETED',
  startedAt: standaloneRow.startedAt,
  completedAt: standaloneRow.completedAt,
  notes: null,
  _count: { completedSets: 5 },
}

const baseWhere = { userId: 'user001', status: 'COMPLETED', completedAt: { not: null } }

describe('GET /api/history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetQuery.mockReturnValue({})
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('throws 401 when userId is not set on the context (no leak)', async () => {
    const event = { path: '/api/history', context: {} }
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Unauthorized' })

    expect(mockProgramFindMany).not.toHaveBeenCalled()
    expect(mockStandaloneFindMany).not.toHaveBeenCalled()
  })

  test('merges program and standalone sessions newest-first with type discriminators', async () => {
    mockProgramFindMany.mockResolvedValueOnce([programRow])
    mockStandaloneFindMany.mockResolvedValueOnce([standaloneRow])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    // standalone completed Jul 21, program Jul 20 -> standalone first
    expect(result).toEqual({ sessions: [shapedStandaloneRow, shapedProgramRow] })

    expect(mockProgramFindMany).toHaveBeenCalledWith({
      where: baseWhere,
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: 20,
      include: {
        _count: { select: { completedSets: true } },
        userProgram: {
          select: {
            program: { select: { name: true } },
          },
        },
      },
    })
    expect(mockStandaloneFindMany).toHaveBeenCalledWith({
      where: baseWhere,
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: 20,
      include: {
        _count: { select: { completedSets: true } },
        standaloneWorkout: {
          select: { id: true, category: true, order: true, name: true },
        },
      },
    })
  })

  test('breaks completedAt ties by id DESC across tables', async () => {
    const tiedAt = new Date('2026-07-19T12:00:00Z')
    mockProgramFindMany.mockResolvedValueOnce([{ ...programRow, id: 'aaa01', completedAt: tiedAt }])
    mockStandaloneFindMany.mockResolvedValueOnce([{ ...standaloneRow, id: 'zzz01', completedAt: tiedAt }])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event) as { sessions: { id: string }[] }

    expect(result.sessions.map(s => s.id)).toEqual(['zzz01', 'aaa01'])
  })

  test('trims the merged result to limit', async () => {
    mockGetQuery.mockReturnValue({ limit: '1' })
    mockProgramFindMany.mockResolvedValueOnce([programRow])
    mockStandaloneFindMany.mockResolvedValueOnce([standaloneRow])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event) as { sessions: unknown[] }

    expect(result.sessions).toEqual([shapedStandaloneRow])
    expect(mockProgramFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }))
    expect(mockStandaloneFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }))
  })

  test('type=program queries only program sessions', async () => {
    mockGetQuery.mockReturnValue({ type: 'program' })
    mockProgramFindMany.mockResolvedValueOnce([programRow])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual({ sessions: [shapedProgramRow] })
    expect(mockStandaloneFindMany).not.toHaveBeenCalled()
  })

  test('type=standalone queries only standalone sessions', async () => {
    mockGetQuery.mockReturnValue({ type: 'standalone' })
    mockStandaloneFindMany.mockResolvedValueOnce([standaloneRow])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual({ sessions: [shapedStandaloneRow] })
    expect(mockProgramFindMany).not.toHaveBeenCalled()
  })

  test('throws 400 on an unknown type', async () => {
    mockGetQuery.mockReturnValue({ type: 'cardio' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid type' })
  })

  test('throws 400 on a non-string type (repeated param)', async () => {
    mockGetQuery.mockReturnValue({ type: ['program', 'standalone'] })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid type' })
  })

  test('clamps limit above MAX_LIMIT to 50', async () => {
    mockGetQuery.mockReturnValue({ limit: '999' })
    mockProgramFindMany.mockResolvedValueOnce([])
    mockStandaloneFindMany.mockResolvedValueOnce([])

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockProgramFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }))
    expect(mockStandaloneFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }))
  })

  test('clamps limit below MIN_LIMIT to 1', async () => {
    mockGetQuery.mockReturnValue({ limit: '0' })
    mockProgramFindMany.mockResolvedValueOnce([])
    mockStandaloneFindMany.mockResolvedValueOnce([])

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockProgramFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }))
  })

  test('throws 400 on a non-digit limit', async () => {
    mockGetQuery.mockReturnValue({ limit: 'abc' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid limit' })
  })

  test('applies the composite cursor to both tables', async () => {
    mockGetQuery.mockReturnValue({ before: '2026-07-01T00:00:00.000Z', beforeId: 'cursor01' })
    mockProgramFindMany.mockResolvedValueOnce([])
    mockStandaloneFindMany.mockResolvedValueOnce([])

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    const cursorWhere = {
      userId: 'user001',
      status: 'COMPLETED',
      completedAt: { not: null },
      OR: [
        { completedAt: { lt: new Date('2026-07-01T00:00:00.000Z') } },
        { completedAt: new Date('2026-07-01T00:00:00.000Z'), id: { lt: 'cursor01' } },
      ],
    }
    expect(mockProgramFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: cursorWhere }))
    expect(mockStandaloneFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: cursorWhere }))
  })

  test('throws 400 when before is provided without beforeId', async () => {
    mockGetQuery.mockReturnValue({ before: '2026-07-01T00:00:00.000Z' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'before and beforeId must be provided together' })
  })

  test('throws 400 when beforeId is provided without before', async () => {
    mockGetQuery.mockReturnValue({ beforeId: 'cursor01' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'before and beforeId must be provided together' })
  })

  test('throws 400 on an unparseable before timestamp', async () => {
    mockGetQuery.mockReturnValue({ before: 'not-a-date', beforeId: 'cursor01' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid before timestamp' })
  })

  test('throws 500 and logs on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockProgramFindMany.mockRejectedValueOnce(dbError)
    mockStandaloneFindMany.mockResolvedValueOnce([])

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch workout history' })

    expect(logger.error).toHaveBeenCalledWith(
      { err: dbError, route: 'GET /api/history' },
      '[GET /api/history] Failed to fetch history',
    )
  })

  test('re-throws an H3 error without wrapping it as 500', async () => {
    const h3Error = new Error('Teapot') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 418
    h3Error.statusMessage = 'Teapot'
    mockProgramFindMany.mockRejectedValueOnce(h3Error)
    mockStandaloneFindMany.mockResolvedValueOnce([])

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(418)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
