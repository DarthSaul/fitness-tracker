import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './dates.get'

const mockFindManySessions = (prisma as typeof prisma).workoutSession.findMany as ReturnType<typeof vi.fn>
const mockFindManyStandaloneSessions = (prisma as typeof prisma).standaloneWorkoutSession.findMany as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent() {
  return {
    path: '/api/history/dates',
    context: { userId: 'user001' },
  }
}

describe('GET /api/history/dates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindManySessions.mockResolvedValue([])
    mockFindManyStandaloneSessions.mockResolvedValue([])
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('throws 401 when userId is missing from context', async () => {
    const event = { path: '/api/history/dates', context: {} as { userId?: string } }
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  test('returns empty list when no completed sessions exist', async () => {
    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ completedAt: string[] }>)(event)

    expect(result).toEqual({ completedAt: [] })
  })

  test('queries both session tables filtered to COMPLETED with a completedAt', async () => {
    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    const where = { userId: 'user001', status: 'COMPLETED', completedAt: { not: null } }
    expect(mockFindManySessions).toHaveBeenCalledWith(
      expect.objectContaining({ where, select: { completedAt: true } }),
    )
    expect(mockFindManyStandaloneSessions).toHaveBeenCalledWith(
      expect.objectContaining({ where, select: { completedAt: true } }),
    )
  })

  test('returns ISO timestamps from program sessions', async () => {
    const a = new Date('2026-08-05T14:00:00.000Z')
    mockFindManySessions.mockResolvedValueOnce([{ completedAt: a }])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ completedAt: string[] }>)(event)

    expect(result.completedAt).toEqual([a.toISOString()])
  })

  test('merges standalone session timestamps, sorted ascending', async () => {
    const early = new Date('2026-08-01T10:00:00.000Z')
    const middle = new Date('2026-08-05T14:00:00.000Z')
    const late = new Date('2026-08-20T09:00:00.000Z')
    mockFindManySessions.mockResolvedValueOnce([{ completedAt: middle }])
    mockFindManyStandaloneSessions.mockResolvedValueOnce([{ completedAt: late }, { completedAt: early }])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ completedAt: string[] }>)(event)

    expect(result.completedAt).toEqual([early.toISOString(), middle.toISOString(), late.toISOString()])
  })

  test('throws 500 and logs error when a query fails', async () => {
    const dbError = new Error('connection reset')
    mockFindManyStandaloneSessions.mockRejectedValueOnce(dbError)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch workout dates' })

    expect(logger.error).toHaveBeenCalledWith(
      { err: dbError, route: 'GET /api/history/dates' },
      '[GET /api/history/dates] Failed to fetch workout dates',
    )
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('Unauthorized') as Error & { statusCode: number }
    h3Error.statusCode = 401
    mockFindManySessions.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(401)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
