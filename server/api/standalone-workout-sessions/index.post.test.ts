/**
 * Tests for server/api/standalone-workout-sessions/index.post.ts
 *
 * Coverage strategy:
 *  - Happy path: starts a session inside the interactive $transaction, 201
 *  - Validation: 400 when standaloneWorkoutId is missing, blank, or non-string
 *  - Not found: 404 when the standalone workout does not exist
 *  - Conflict: 409 when an IN_PROGRESS session already exists, 409 on P2002
 *    (TOCTOU backstop from the partial unique index)
 *  - Error propagation: 500 on unexpected error, logs via logger.error
 *  - H3 error pass-through: re-throws an H3 error without wrapping it as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.post'

const mockTransaction = (prisma as typeof prisma).$transaction as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

// Transaction-scoped mocks (used inside the interactive transaction callback)
const txMocks = {
  findUniqueWorkout: vi.fn(),
  findFirstSession: vi.fn(),
  createSession: vi.fn(),
}

function makeEvent() {
  return {
    path: '/api/standalone-workout-sessions',
    context: { userId: 'user001' },
    node: { res: { statusCode: 200 } },
  }
}

const mockWorkout = { id: 'sw001', category: 'Upper Push', order: 1, name: 'Push Day' }

const mockSession = {
  id: 'sws001',
  userId: 'user001',
  standaloneWorkoutId: 'sw001',
  status: 'IN_PROGRESS',
  startedAt: new Date(),
  completedAt: null,
}

describe('POST /api/standalone-workout-sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadBody.mockResolvedValue({ standaloneWorkoutId: 'sw001' })
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        standaloneWorkout: { findUnique: txMocks.findUniqueWorkout },
        standaloneWorkoutSession: { findFirst: txMocks.findFirstSession, create: txMocks.createSession },
      }
      return fn(tx)
    })
  })

  test('starts a session and returns 201 with the session', async () => {
    txMocks.findUniqueWorkout.mockResolvedValueOnce(mockWorkout)
    txMocks.findFirstSession.mockResolvedValueOnce(null)
    txMocks.createSession.mockResolvedValueOnce(mockSession)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ session: unknown }>)(event)

    expect(result).toEqual({ session: mockSession })
    expect(event.node.res.statusCode).toBe(201)
    expect(txMocks.findUniqueWorkout).toHaveBeenCalledWith({ where: { id: 'sw001' } })
    expect(txMocks.findFirstSession).toHaveBeenCalledWith({
      where: { userId: 'user001', standaloneWorkoutId: 'sw001', status: 'IN_PROGRESS' },
    })
    expect(txMocks.createSession).toHaveBeenCalledWith({
      data: { userId: 'user001', standaloneWorkoutId: 'sw001', status: 'IN_PROGRESS' },
    })
  })

  test('throws 400 when standaloneWorkoutId is missing', async () => {
    mockReadBody.mockResolvedValueOnce({})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing standaloneWorkoutId' })
  })

  test('throws 400 when standaloneWorkoutId is an empty/whitespace string', async () => {
    mockReadBody.mockResolvedValueOnce({ standaloneWorkoutId: '   ' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing standaloneWorkoutId' })
  })

  test('throws 400 when standaloneWorkoutId is not a string', async () => {
    mockReadBody.mockResolvedValueOnce({ standaloneWorkoutId: 123 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing standaloneWorkoutId' })
  })

  test('throws 404 when standalone workout does not exist', async () => {
    txMocks.findUniqueWorkout.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Standalone workout not found' })
  })

  test('throws 409 when an in-progress session already exists', async () => {
    txMocks.findUniqueWorkout.mockResolvedValueOnce(mockWorkout)
    txMocks.findFirstSession.mockResolvedValueOnce(mockSession)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'A session is already in progress for this workout' })

    expect(txMocks.createSession).not.toHaveBeenCalled()
  })

  test('throws 409 on concurrent duplicate session (P2002)', async () => {
    const p2002Error = new Error('Unique constraint failed') as Error & { code: string }
    p2002Error.code = 'P2002'
    mockTransaction.mockRejectedValueOnce(p2002Error)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'A session is already in progress for this workout' })
  })

  test('throws 500 and logs on unexpected error', async () => {
    const dbError = new Error('connection reset')
    txMocks.findUniqueWorkout.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to start standalone workout session' })

    expect(logger.error).toHaveBeenCalledWith(
      { err: dbError, route: 'POST /api/standalone-workout-sessions' },
      '[POST /api/standalone-workout-sessions] Failed to start standalone workout session',
    )
    consoleSpy.mockRestore()
  })

  test('re-throws H3 errors without wrapping them as 500', async () => {
    const h3Error = new Error('Standalone workout not found') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'Standalone workout not found'
    txMocks.findUniqueWorkout.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(404)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })

  test('uses interactive $transaction for atomic check-and-create', async () => {
    txMocks.findUniqueWorkout.mockResolvedValueOnce(mockWorkout)
    txMocks.findFirstSession.mockResolvedValueOnce(null)
    txMocks.createSession.mockResolvedValueOnce(mockSession)

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockTransaction).toHaveBeenCalledOnce()
    expect(mockTransaction).toHaveBeenCalledWith(expect.any(Function))
  })
})
