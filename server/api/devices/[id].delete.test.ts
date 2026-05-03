/**
 * Tests for server/api/devices/[id].delete.ts
 *
 * Coverage strategy:
 *  - Happy path: soft-deletes token and returns 204
 *  - Validation: throws 400 when id is empty/missing
 *  - Not found: throws 404 when device token not found
 *  - Ownership: throws 403 when device token belongs to different user
 *  - Update shape: calls update with { revokedAt: new Date() }
 *  - Error propagation: throws 500 on unexpected DB error, logs the error
 *  - H3 error pass-through: re-throws H3 errors without wrapping as 500
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

import handler from './[id].delete'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockFindUnique = (prisma as any).deviceToken.findUnique as ReturnType<typeof vi.fn>
const mockUpdate = (prisma as any).deviceToken.update as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id: string | undefined = 'dt001', userId = 'user001') {
  mockGetRouterParam.mockReturnValue(id)
  return {
    path: `/api/devices/${id ?? ''}`,
    context: { userId },
    node: { res: { statusCode: 200 } },
  }
}

const mockDeviceToken = {
  id: 'dt001',
  userId: 'user001',
  token: 'tok-abc',
  platform: 'IOS' as const,
  environment: 'SANDBOX' as const,
  createdAt: new Date(),
  lastSeenAt: new Date(),
  revokedAt: null,
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
      mockFindUnique.mockResolvedValueOnce(mockDeviceToken)
      mockUpdate.mockResolvedValueOnce(mockDeviceToken)

      const event = makeEvent()
      const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

      expect(result).toBeNull()
      expect(event.node.res.statusCode).toBe(204)
    })

    test('calls update with { revokedAt: new Date() }', async () => {
      mockFindUnique.mockResolvedValueOnce(mockDeviceToken)
      mockUpdate.mockResolvedValueOnce(mockDeviceToken)

      const event = makeEvent()
      await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'dt001' },
        data: { revokedAt: expect.any(Date) },
      })
    })
  })

  describe('request validation', () => {
    test('throws 400 when id is undefined', async () => {
      // Override getRouterParam to return undefined directly (makeEvent default would use 'dt001')
      mockGetRouterParam.mockReturnValue(undefined)
      const event = {
        path: '/api/devices/',
        context: { userId: 'user001' },
        node: { res: { statusCode: 200 } },
      }

      await expect(
        (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
      ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'id is required' })
    })

    test('throws 400 when id is empty string', async () => {
      const event = makeEvent('   ')

      await expect(
        (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
      ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'id is required' })
    })
  })

  describe('not found and ownership', () => {
    test('throws 404 when device token not found', async () => {
      mockFindUnique.mockResolvedValueOnce(null)

      const event = makeEvent('dt999')
      await expect(
        (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
      ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Device token not found' })
    })

    test('throws 403 when device token belongs to different user', async () => {
      mockFindUnique.mockResolvedValueOnce({ ...mockDeviceToken, userId: 'other-user' })

      const event = makeEvent('dt001', 'user001')
      await expect(
        (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
      ).rejects.toMatchObject({ statusCode: 403, statusMessage: 'Forbidden' })
    })
  })

  describe('error handling', () => {
    test('throws 500 on unexpected DB error', async () => {
      mockFindUnique.mockRejectedValueOnce(new Error('DB connection lost'))

      const event = makeEvent()
      await expect(
        (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
      ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to unregister device token' })
    })

    test('logs the error on unexpected DB failure', async () => {
      const dbError = new Error('DB connection lost')
      mockFindUnique.mockRejectedValueOnce(dbError)

      const event = makeEvent()
      try {
        await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)
      } catch {
        // expected
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        '[DELETE /api/devices/:id] Failed to unregister device token',
        dbError,
      )
    })

    test('re-throws H3 errors without wrapping as 500', async () => {
      const h3Error = new Error('Device token not found') as Error & { statusCode: number; statusMessage: string }
      h3Error.statusCode = 404
      h3Error.statusMessage = 'Device token not found'
      mockFindUnique.mockRejectedValueOnce(h3Error)

      const event = makeEvent()
      const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)
        .catch((e: unknown) => e) as { statusCode: number }

      expect(thrown.statusCode).toBe(404)
      expect(mockCreateError).not.toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500 }),
      )
    })
  })
})
