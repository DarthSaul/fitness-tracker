/**
 * Tests for server/api/devices/[id].delete.ts
 *
 * Coverage strategy:
 *  - Happy path: revokes the caller's own token and returns 204
 *  - Idempotence: missing, already-revoked and another user's tokens all
 *    return 204, so sign-out never fails on this call
 *  - Ownership: the revoke is scoped to the caller, so another user's row is
 *    never matched
 *  - Validation: throws 400 when id is empty/missing
 *  - Error propagation: throws 500 on unexpected DB error, logs the error
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

import handler from './[id].delete'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockUpdateMany = (prisma as any).deviceToken.updateMany as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id: string | undefined = 'dt001', userId = 'user001') {
  mockGetRouterParam.mockReturnValue(id)
  return {
    path: `/api/devices/${id ?? ''}`,
    context: { userId },
    node: { res: { statusCode: 200 } },
  }
}

describe('DELETE /api/devices/:id', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('happy path', () => {
    test('returns null and sets statusCode to 204', async () => {
      mockUpdateMany.mockResolvedValueOnce({ count: 1 })

      const event = makeEvent()
      const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

      expect(result).toBeNull()
      expect(event.node.res.statusCode).toBe(204)
    })

    test('revokes only a live token owned by the caller', async () => {
      mockUpdateMany.mockResolvedValueOnce({ count: 1 })

      const event = makeEvent('dt001', 'user001')
      await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: 'dt001', userId: 'user001', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      })
    })
  })

  describe('idempotence — sign-out must never fail on this call', () => {
    test.each([
      ['the token does not exist'],
      ['the token is already revoked'],
      ['the token belongs to another user'],
    ])('returns 204 when %s', async () => {
      // All three match no row under the caller-scoped WHERE.
      mockUpdateMany.mockResolvedValueOnce({ count: 0 })

      const event = makeEvent('dt999', 'user001')
      const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

      expect(result).toBeNull()
      expect(event.node.res.statusCode).toBe(204)
    })

    test("never matches another user's token", async () => {
      mockUpdateMany.mockResolvedValueOnce({ count: 0 })

      const event = makeEvent('dt-owned-by-user002', 'user001')
      await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

      expect(mockUpdateMany.mock.calls[0]?.[0].where.userId).toBe('user001')
    })
  })

  describe('request validation', () => {
    test('throws 400 when id is undefined', async () => {
      mockGetRouterParam.mockReturnValue(undefined)
      const event = {
        path: '/api/devices/',
        context: { userId: 'user001' },
        node: { res: { statusCode: 200 } },
      }

      await expect(
        (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
      ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'id is required' })
      expect(mockUpdateMany).not.toHaveBeenCalled()
    })

    test('throws 400 when id is empty string', async () => {
      const event = makeEvent('   ')

      await expect(
        (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
      ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'id is required' })
    })
  })

  describe('error handling', () => {
    test('throws 500 on unexpected DB error', async () => {
      mockUpdateMany.mockRejectedValueOnce(new Error('DB connection lost'))

      const event = makeEvent()
      await expect(
        (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
      ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to unregister device token' })
    })

    test('logs the error on unexpected DB failure', async () => {
      const dbError = new Error('DB connection lost')
      mockUpdateMany.mockRejectedValueOnce(dbError)

      const event = makeEvent()
      try {
        await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)
      } catch {
        // expected
      }

      expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'DELETE /api/devices/:id' }, '[DELETE /api/devices/:id] Failed to unregister device token')
    })
  })
})
