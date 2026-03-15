/**
 * Tests for server/api/health.get.ts
 *
 * Coverage strategy:
 *  - Happy path: returns { status: 'ok', timestamp } when DB is reachable
 *  - Timestamp validation: timestamp is a valid ISO string
 *  - DB failure: throws 503 when DB is unreachable
 *  - Error logging: logs error when DB is unreachable
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './health.get'

const mockQueryRaw = (prisma as any).$queryRaw as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent() {
  return { path: '/api/health', context: {} }
}

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns { status: "ok", timestamp } when DB is reachable', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }])

    const event = makeEvent()
    const result = await (handler as (e: typeof event) => Promise<unknown>)(event) as {
      status: string
      timestamp: string
    }

    expect(result).toMatchObject({ status: 'ok' })
    expect(result).toHaveProperty('timestamp')
    expect(mockQueryRaw).toHaveBeenCalledOnce()
  })

  test('timestamp is a valid ISO string', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }])

    const event = makeEvent()
    const result = await (handler as (e: typeof event) => Promise<unknown>)(event) as {
      timestamp: string
    }

    const parsed = new Date(result.timestamp)
    expect(parsed.toISOString()).toBe(result.timestamp)
  })

  test('throws 503 when DB is unreachable', async () => {
    const dbError = new Error('connection refused')
    mockQueryRaw.mockRejectedValueOnce(dbError)
    mockCreateError.mockImplementationOnce((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 503, statusMessage: 'Database connection failed' })

    expect(mockCreateError).toHaveBeenCalledWith({
      statusCode: 503,
      statusMessage: 'Database connection failed',
    })
    consoleSpy.mockRestore()
  })

  test('logs error when DB is unreachable', async () => {
    const dbError = new Error('connection refused')
    mockQueryRaw.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    try {
      await (handler as (e: typeof event) => Promise<unknown>)(event)
    } catch {
      // expected
    }

    expect(consoleSpy).toHaveBeenCalledWith(
      'Health check failed: database unreachable',
      dbError,
    )
    consoleSpy.mockRestore()
  })
})
