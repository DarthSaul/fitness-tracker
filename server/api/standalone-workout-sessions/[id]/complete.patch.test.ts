/**
 * Tests for server/api/standalone-workout-sessions/[id]/complete.patch.ts
 *
 * Coverage strategy:
 *  - Happy path: no body -> completedAt defaults to now
 *  - Happy path: explicit past completedAt is honored
 *  - Validation: explicit completedAt: null is rejected with 400
 *  - Validation: a primitive JSON body is treated as "no completedAt" (now)
 *  - Validation: 400 missing id, 400 invalid completedAt, 400 future
 *    completedAt
 *  - Not found: 404 when the conditional update matches nothing and the row
 *    is gone
 *  - Ownership: 404 when session belongs to a different user
 *  - Conflict: 409 when session already completed
 *  - Concurrency (regression): a concurrent deletion maps to 404, not 500
 *  - Concurrency (regression): two racing completions -> exactly one wins, the
 *    loser gets 409 and completedAt is written only once (no lost update)
 *  - Error propagation: 500 on unexpected error, logs via logger.error
 *  - H3 error pass-through: re-throws an H3 error without wrapping it as 500
 *
 * The completion is a single conditional `updateMany`
 * (`where: { id, userId, status: { not: 'COMPLETED' } }`) that revalidates the
 * row at write time, followed by a `findUnique` — either to build the response
 * (on count 1) or to map the failure reason (on count 0).
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

import handler from './complete.patch'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockFindUnique = (prisma as typeof prisma).standaloneWorkoutSession.findUnique as ReturnType<typeof vi.fn>
const mockUpdateMany = (prisma as typeof prisma).standaloneWorkoutSession.updateMany as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id = 'sws001') {
  mockGetRouterParam.mockReturnValue(id)
  return { path: `/api/standalone-workout-sessions/${id}/complete`, context: { userId: 'user001' } }
}

const mockSession = { id: 'sws001', userId: 'user001', status: 'IN_PROGRESS' }
const mockUpdatedSession = { ...mockSession, status: 'COMPLETED', completedAt: new Date() }

describe('PATCH /api/standalone-workout-sessions/:id/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadBody.mockResolvedValue(undefined)
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('defaults completedAt to now when no body is provided', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-20T12:00:00Z'))
    mockUpdateMany.mockResolvedValueOnce({ count: 1 })
    mockFindUnique.mockResolvedValueOnce(mockUpdatedSession)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ session: unknown }>)(event)

    expect(result).toEqual({ session: mockUpdatedSession })
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'sws001', userId: 'user001', status: { not: 'COMPLETED' } },
      data: { status: 'COMPLETED', completedAt: new Date('2026-07-20T12:00:00Z') },
    })
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: 'sws001' } })
  })

  test('honors an explicit past completedAt', async () => {
    const completedAt = '2026-07-01T09:00:00Z'
    mockReadBody.mockResolvedValueOnce({ completedAt })
    mockUpdateMany.mockResolvedValueOnce({ count: 1 })
    mockFindUnique.mockResolvedValueOnce(mockUpdatedSession)

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'sws001', userId: 'user001', status: { not: 'COMPLETED' } },
      data: { status: 'COMPLETED', completedAt: new Date(completedAt) },
    })
  })

  test('rejects completing with an explicit null completedAt (400)', async () => {
    mockReadBody.mockResolvedValueOnce({ completedAt: null })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'completedAt cannot be null when completing a session',
    })

    expect(mockUpdateMany).not.toHaveBeenCalled()
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  test('treats a primitive JSON body as no completedAt (defaults to now)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-20T12:00:00Z'))
    mockReadBody.mockResolvedValueOnce('just a string')
    mockUpdateMany.mockResolvedValueOnce({ count: 1 })
    mockFindUnique.mockResolvedValueOnce(mockUpdatedSession)

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'sws001', userId: 'user001', status: { not: 'COMPLETED' } },
      data: { status: 'COMPLETED', completedAt: new Date('2026-07-20T12:00:00Z') },
    })
  })

  test('throws 400 when id param is missing', async () => {
    const event = makeEvent(undefined as unknown as string)
    mockGetRouterParam.mockReturnValue(undefined)

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
  })

  test('throws 400 when id param is whitespace only', async () => {
    mockGetRouterParam.mockReturnValue('   ')
    const event = makeEvent('   ')

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
  })

  test('throws 400 when completedAt is not a valid date', async () => {
    mockReadBody.mockResolvedValueOnce({ completedAt: 'not-a-date' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid completedAt date' })
  })

  test('throws 400 when completedAt is in the future', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    mockReadBody.mockResolvedValueOnce({ completedAt: future })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'completedAt cannot be in the future' })
  })

  test('throws 404 when session does not exist', async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 0 })
    mockFindUnique.mockResolvedValueOnce(null)

    const event = makeEvent('sws999')
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Session not found' })
  })

  test('throws the same 404 when session belongs to a different user', async () => {
    // Identical message to the missing-session case so callers cannot
    // distinguish "does not exist" from "not yours".
    mockUpdateMany.mockResolvedValueOnce({ count: 0 })
    mockFindUnique.mockResolvedValueOnce({ userId: 'other-user' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Session not found' })
  })

  test('throws 409 when session is already completed', async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 0 })
    mockFindUnique.mockResolvedValueOnce({ userId: 'user001' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Session already completed' })
  })

  test('maps a concurrent deletion to 404, not 500 (regression)', async () => {
    // The row is deleted after validation: the conditional update matches
    // nothing (count 0) and the re-read finds it gone. This must surface as a
    // clean 404 — never a P2025-driven 500 — and must not log a server error.
    mockUpdateMany.mockResolvedValueOnce({ count: 0 })
    mockFindUnique.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Session not found' })

    expect(logger.error).not.toHaveBeenCalled()
  })

  test('two racing completions: one wins, the other 409s without overwriting completedAt (regression)', async () => {
    // A single shared row mutated by whichever conditional update matches
    // first, emulating the DB. The second completion must not overwrite
    // completedAt: it matches zero rows and maps to 409.
    const row = { id: 'sws001', userId: 'user001', status: 'IN_PROGRESS', completedAt: null as Date | null }

    mockUpdateMany.mockImplementation(
      async (args: { data: { completedAt: Date } }) => {
        if (row.status !== 'COMPLETED') {
          row.status = 'COMPLETED'
          row.completedAt = args.data.completedAt
          return { count: 1 }
        }
        return { count: 0 }
      },
    )
    mockFindUnique.mockImplementation(async () => ({ ...row }))

    const event = makeEvent()
    const run = () => (handler as unknown as (e: typeof event) => Promise<{ session: unknown }>)(event)
    const results = await Promise.allSettled([run(), run()])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      statusCode: 409,
      statusMessage: 'Session already completed',
    })
    // completedAt was set exactly once — the loser never overwrote it.
    expect(mockUpdateMany).toHaveBeenCalledTimes(2)
    expect(row.completedAt).not.toBeNull()
  })

  test('throws 500 and logs on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockUpdateMany.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to complete standalone workout session' })

    expect(logger.error).toHaveBeenCalledWith(
      { err: dbError, route: 'PATCH /api/standalone-workout-sessions/:id/complete' },
      '[PATCH /api/standalone-workout-sessions/:id/complete] Failed to complete session',
    )
    consoleSpy.mockRestore()
  })

  test('re-throws an H3 error without wrapping it as 500', async () => {
    const h3Error = new Error('Session not found') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'Session not found'
    mockUpdateMany.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(404)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
