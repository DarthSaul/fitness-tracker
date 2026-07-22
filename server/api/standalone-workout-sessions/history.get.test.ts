/**
 * Tests for server/api/standalone-workout-sessions/history.get.ts
 *
 * Coverage strategy:
 *  - Happy path: default limit (20), exact where/orderBy/include shape
 *  - Pagination boundaries: clamps limit above MAX_LIMIT (50) and below
 *    MIN_LIMIT (1); accepts the exact boundary values (1 and 50)
 *  - Validation: 400 on non-digit/fractional/array limit; 400 on before or
 *    beforeId provided without its pair; 400 on non-string/empty before or
 *    beforeId; 400 on an unparseable before timestamp
 *  - Cursor: composite (completedAt, id) cursor applied when before+beforeId
 *    are both provided
 *  - Error propagation: 500 when findMany rejects, logs via logger.error
 *  - H3 error pass-through: re-throws an H3 error without wrapping it as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './history.get'

const mockFindMany = (prisma as typeof prisma).standaloneWorkoutSession.findMany as ReturnType<typeof vi.fn>
const mockGetQuery = getQuery as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent() {
  return { path: '/api/standalone-workout-sessions/history', context: { userId: 'user001' } }
}

const mockSession = {
  id: 'sws001',
  userId: 'user001',
  standaloneWorkoutId: 'sw001',
  status: 'COMPLETED',
  startedAt: new Date('2026-05-08T11:00:00Z'),
  completedAt: new Date('2026-05-08T12:00:00Z'),
  _count: { completedSets: 5 },
  standaloneWorkout: { id: 'sw001', category: 'Upper Push', order: 1, name: 'Push Day' },
}

describe('GET /api/standalone-workout-sessions/history', () => {
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

  test('returns sessions with default limit and no cursor', async () => {
    mockFindMany.mockResolvedValueOnce([mockSession])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual({ sessions: [mockSession] })
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user001', status: 'COMPLETED', completedAt: { not: null } },
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

  test('clamps limit above MAX_LIMIT to 50', async () => {
    mockGetQuery.mockReturnValue({ limit: '999' })
    mockFindMany.mockResolvedValueOnce([])

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }))
  })

  test('clamps limit below MIN_LIMIT to 1', async () => {
    mockGetQuery.mockReturnValue({ limit: '0' })
    mockFindMany.mockResolvedValueOnce([])

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }))
  })

  test('accepts limit at the exact upper boundary (50)', async () => {
    mockGetQuery.mockReturnValue({ limit: '50' })
    mockFindMany.mockResolvedValueOnce([])

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }))
  })

  test('accepts limit at the exact lower boundary (1)', async () => {
    mockGetQuery.mockReturnValue({ limit: '1' })
    mockFindMany.mockResolvedValueOnce([])

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }))
  })

  test('rejects non-digit limit with 400', async () => {
    mockGetQuery.mockReturnValue({ limit: 'abc' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid limit' })
  })

  test('rejects fractional limit with 400', async () => {
    mockGetQuery.mockReturnValue({ limit: '1.5' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid limit' })
  })

  test('rejects array limit with 400', async () => {
    mockGetQuery.mockReturnValue({ limit: ['10', '20'] })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid limit' })
  })

  test('applies composite before/beforeId cursor with (completedAt, id) tiebreaker', async () => {
    const before = '2026-05-01T00:00:00Z'
    const beforeId = 'sws050'
    mockGetQuery.mockReturnValue({ before, beforeId })
    mockFindMany.mockResolvedValueOnce([])

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
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

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'before and beforeId must be provided together' })
  })

  test('rejects beforeId without before with 400', async () => {
    mockGetQuery.mockReturnValue({ beforeId: 'sws050' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'before and beforeId must be provided together' })
  })

  test('rejects non-string before (array) with 400', async () => {
    mockGetQuery.mockReturnValue({ before: ['2026-05-01T00:00:00Z', '2026-05-02T00:00:00Z'], beforeId: 'sws050' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid before' })
  })

  test('rejects empty string before with 400', async () => {
    mockGetQuery.mockReturnValue({ before: '', beforeId: 'sws050' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid before' })
  })

  test('rejects non-string beforeId (array) with 400', async () => {
    mockGetQuery.mockReturnValue({ before: '2026-05-01T00:00:00Z', beforeId: ['sws050', 'sws051'] })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid beforeId' })
  })

  test('rejects empty string beforeId with 400', async () => {
    mockGetQuery.mockReturnValue({ before: '2026-05-01T00:00:00Z', beforeId: '' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid beforeId' })
  })

  test('rejects unparseable before timestamp with 400', async () => {
    mockGetQuery.mockReturnValue({ before: 'not-a-date', beforeId: 'sws050' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid before timestamp' })
  })

  test('returns empty sessions array when user has no completed sessions', async () => {
    mockFindMany.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual({ sessions: [] })
  })

  test('throws 500 and logs when findMany rejects', async () => {
    const dbError = new Error('connection reset')
    mockFindMany.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch standalone workout history' })

    expect(logger.error).toHaveBeenCalledWith(
      { err: dbError, route: 'GET /api/standalone-workout-sessions/history' },
      '[GET /api/standalone-workout-sessions/history] Failed to fetch history',
    )
    consoleSpy.mockRestore()
  })

  test('re-throws an H3 error without wrapping it as 500', async () => {
    const h3Error = new Error('Forbidden') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 403
    h3Error.statusMessage = 'Forbidden'
    mockFindMany.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(403)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
