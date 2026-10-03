/**
 * Tests for server/api/devices/register.post.ts
 *
 * Coverage strategy:
 *  - Happy path: upserts device token and returns { id }
 *  - Validation: throws 400 when token is missing or not a hex APNs token
 *  - Validation: throws 400 when platform is invalid
 *  - Validation: throws 400 when environment is invalid
 *  - Upsert shape: called with correct userId_token key and fields
 *  - Re-register (update path): lastSeenAt updated, revokedAt null
 *  - Error propagation: throws 500 on unexpected DB error, logs the error
 *  - H3 error pass-through: re-throws H3 errors without wrapping as 500
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

import handler from './register.post'

const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockUpsert = (prisma as any).deviceToken.upsert as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

// APNs tokens are 64 hex chars today.
const TOKEN = 'a1b2c3d4'.repeat(8)
const OTHER_TOKEN = 'f0e1d2c3'.repeat(8)

function makeEvent(body: unknown = { token: TOKEN, platform: 'IOS', environment: 'SANDBOX' }) {
  mockReadBody.mockResolvedValue(body)
  return {
    path: '/api/devices/register',
    context: { userId: 'user001' },
    node: { res: { statusCode: 200 } },
  }
}

describe('POST /api/devices/register', () => {
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
    test('returns { id } on successful upsert', async () => {
      mockUpsert.mockResolvedValueOnce({ id: 'dt001', token: TOKEN })

      const event = makeEvent()
      const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

      expect(result).toEqual({ id: 'dt001' })
    })

    test('calls upsert with correct userId_token key and fields', async () => {
      mockUpsert.mockResolvedValueOnce({ id: 'dt001' })

      const event = makeEvent({ token: OTHER_TOKEN, platform: 'IOS', environment: 'PRODUCTION' })
      await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

      expect(mockUpsert).toHaveBeenCalledWith({
        where: { token_environment: { token: OTHER_TOKEN, environment: 'PRODUCTION' } },
        update: { userId: 'user001', lastSeenAt: expect.any(Date), revokedAt: null },
        create: {
          userId: 'user001',
          token: OTHER_TOKEN,
          platform: 'IOS',
          environment: 'PRODUCTION',
        },
      })
    })

    test('on re-register: lastSeenAt updated, revokedAt set to null', async () => {
      mockUpsert.mockResolvedValueOnce({ id: 'dt001' })

      const event = makeEvent({ token: TOKEN, platform: 'IOS', environment: 'SANDBOX' })
      await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

      const call = mockUpsert.mock.calls[0]?.[0]
      expect(call?.update.lastSeenAt).toBeInstanceOf(Date)
      expect(call?.update.revokedAt).toBeNull()
    })
  })

  describe('request validation', () => {
    test('throws 400 when token is missing', async () => {
      const event = makeEvent({ platform: 'IOS', environment: 'SANDBOX' })
      await expect(
        (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
      ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'token is required' })
    })

    test('throws 400 when body is null', async () => {
      const event = makeEvent(null)
      await expect(
        (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
      ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'token is required' })
    })

    test.each([
      ['non-hex characters', 'not-a-hex-token'.padEnd(64, 'x')],
      ['a path separator', `${'a'.repeat(32)}/${'a'.repeat(31)}`],
      ['too short', 'abc123'],
      ['a non-string', 12345],
    ])('throws 400 and writes nothing when token has %s', async (_label, token) => {
      const event = makeEvent({ token, platform: 'IOS', environment: 'SANDBOX' })
      await expect(
        (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
      ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'token must be a hex APNs device token' })
      expect(mockUpsert).not.toHaveBeenCalled()
    })

    test('throws 400 when platform is invalid (ANDROID)', async () => {
      const event = makeEvent({ token: TOKEN, platform: 'ANDROID', environment: 'SANDBOX' })
      await expect(
        (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
      ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'platform must be IOS' })
    })

    test('throws 400 when platform is missing', async () => {
      const event = makeEvent({ token: TOKEN, environment: 'SANDBOX' })
      await expect(
        (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
      ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'platform must be IOS' })
    })

    test('throws 400 when environment is invalid (STAGING)', async () => {
      const event = makeEvent({ token: TOKEN, platform: 'IOS', environment: 'STAGING' })
      await expect(
        (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
      ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'environment must be SANDBOX or PRODUCTION' })
    })

    test('throws 400 when environment is missing', async () => {
      const event = makeEvent({ token: TOKEN, platform: 'IOS' })
      await expect(
        (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
      ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'environment must be SANDBOX or PRODUCTION' })
    })
  })

  describe('error handling', () => {
    test('throws 500 on unexpected DB error', async () => {
      mockUpsert.mockRejectedValueOnce(new Error('DB connection lost'))

      const event = makeEvent()
      await expect(
        (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
      ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to register device token' })
    })

    test('logs the error on unexpected DB failure', async () => {
      const dbError = new Error('DB connection lost')
      mockUpsert.mockRejectedValueOnce(dbError)

      const event = makeEvent()
      try {
        await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)
      } catch {
        // expected
      }

      expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'POST /api/devices/register' }, '[POST /api/devices/register] Failed to register device token')
    })

    test('re-throws H3 errors without wrapping as 500', async () => {
      const h3Error = new Error('Conflict') as Error & { statusCode: number; statusMessage: string }
      h3Error.statusCode = 409
      h3Error.statusMessage = 'Conflict'
      mockUpsert.mockRejectedValueOnce(h3Error)

      const event = makeEvent()
      const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)
        .catch((e: unknown) => e) as { statusCode: number }

      expect(thrown.statusCode).toBe(409)
      expect(mockCreateError).not.toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500 }),
      )
    })
  })
})
