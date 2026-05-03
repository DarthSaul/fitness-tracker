/**
 * Tests for server/utils/apns.ts
 *
 * Coverage strategy:
 *  - sendPush: no active tokens → returns without calling Pool.request
 *  - sendPush: calls pool.request for each active token
 *  - APNs 200 response: success, no DB update
 *  - APNs 410 response: prisma.deviceToken.update called to soft-revoke
 *  - APNs 4xx/5xx response: error logged, no throw (Promise.allSettled)
 *  - JWT caching: second call within 55 min returns cached token (no re-sign)
 *  - JWT refresh: call after 55 min generates a new token
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

// Fake base64-encoded PEM key (non-empty; importPKCS8 is mocked)
const FAKE_PRIVATE_KEY_B64 = Buffer.from('-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n').toString('base64')

// Shared mock references — these are set up by the factory in vi.mock so they
// persist across calls to vi.clearAllMocks() (the vi.fn() instances are reused).
const mockRequest = vi.fn()

vi.mock('undici', () => {
  // Use a named function so new Pool() works as a constructor
  function Pool(_origin: string, _opts?: unknown) {
    return { request: mockRequest }
  }
  return { Pool }
})

const mockImportPKCS8 = vi.fn()
const mockSign = vi.fn()

vi.mock('jose', () => {
  // MockSignJWT must behave as a class (new SignJWT({}))
  function SignJWT(_payload: unknown) {
    return {
      setProtectedHeader: vi.fn().mockReturnThis(),
      setIssuedAt: vi.fn().mockReturnThis(),
      setIssuer: vi.fn().mockReturnThis(),
      sign: mockSign,
    }
  }
  return {
    importPKCS8: mockImportPKCS8,
    SignJWT,
  }
})

// Dynamic import AFTER vi.mock declarations so the module sees the mocked deps.
// Top-level await is allowed in Vitest ESM test files.
const { sendPush } = await import('./apns')

const mockDeviceTokenFindMany = (prisma as any).deviceToken.findMany as ReturnType<typeof vi.fn>
const mockDeviceTokenUpdate = (prisma as any).deviceToken.update as ReturnType<typeof vi.fn>
const mockUseRuntimeConfig = useRuntimeConfig as ReturnType<typeof vi.fn>

function makeTokenRecord(overrides: Partial<{
  id: string
  userId: string
  token: string
  environment: string
  revokedAt: Date | null
}> = {}) {
  return {
    id: 'dt001',
    userId: 'user001',
    token: 'device-token-abc',
    platform: 'IOS',
    environment: 'SANDBOX',
    revokedAt: null,
    ...overrides,
  }
}

describe('server/utils/apns', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>
  let dateSpy: ReturnType<typeof vi.spyOn> | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Default runtime config with all APNs fields populated
    mockUseRuntimeConfig.mockReturnValue({
      apnsTeamId: 'TEAM123456',
      apnsKeyId: 'KEY1234567',
      apnsPrivateKey: FAKE_PRIVATE_KEY_B64,
      appleBundleId: 'com.example.fitnesstracker',
    })

    // Default jose mocks
    mockImportPKCS8.mockResolvedValue({ type: 'private' })
    mockSign.mockResolvedValue('signed-apns-jwt')

    // Default successful APNs response
    mockRequest.mockResolvedValue({
      statusCode: 200,
      body: { text: vi.fn().mockResolvedValue('') },
    })
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    if (dateSpy) {
      dateSpy.mockRestore()
      dateSpy = null
    }
  })

  describe('sendPush — no active tokens', () => {
    test('returns without calling Pool.request when no active tokens', async () => {
      mockDeviceTokenFindMany.mockResolvedValueOnce([])

      await sendPush('user001', { aps: { alert: { title: 'Hi', body: 'Test' } } })

      expect(mockRequest).not.toHaveBeenCalled()
    })

    test('queries DB for non-revoked tokens only', async () => {
      mockDeviceTokenFindMany.mockResolvedValueOnce([])

      await sendPush('user001', { aps: { alert: { title: 'Hi', body: 'Test' } } })

      expect(mockDeviceTokenFindMany).toHaveBeenCalledWith({
        where: { userId: 'user001', revokedAt: null },
      })
    })
  })

  describe('sendPush — with active tokens', () => {
    test('calls pool.request for each active token', async () => {
      mockDeviceTokenFindMany.mockResolvedValueOnce([
        makeTokenRecord({ token: 'tok-1', environment: 'SANDBOX' }),
        makeTokenRecord({ token: 'tok-2', environment: 'PRODUCTION' }),
      ])
      // Provide a response for each request
      mockRequest
        .mockResolvedValueOnce({ statusCode: 200, body: { text: vi.fn().mockResolvedValue('') } })
        .mockResolvedValueOnce({ statusCode: 200, body: { text: vi.fn().mockResolvedValue('') } })

      await sendPush('user001', { aps: { alert: { title: 'Hi', body: 'Test' } } })

      expect(mockRequest).toHaveBeenCalledTimes(2)
    })

    test('sends request to correct path', async () => {
      mockDeviceTokenFindMany.mockResolvedValueOnce([
        makeTokenRecord({ token: 'device-tok-abc' }),
      ])

      await sendPush('user001', { aps: { alert: { title: 'Title', body: 'Body' } } })

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/3/device/device-tok-abc',
          method: 'POST',
        }),
      )
    })

    test('includes authorization header with JWT', async () => {
      mockDeviceTokenFindMany.mockResolvedValueOnce([makeTokenRecord()])

      await sendPush('user001', { aps: { alert: { title: 'T', body: 'B' } } })

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'bearer signed-apns-jwt',
          }),
        }),
      )
    })

    test('includes bundle ID as apns-topic', async () => {
      mockDeviceTokenFindMany.mockResolvedValueOnce([makeTokenRecord()])

      await sendPush('user001', { aps: { alert: { title: 'T', body: 'B' } } })

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'apns-topic': 'com.example.fitnesstracker',
          }),
        }),
      )
    })
  })

  describe('APNs response handling', () => {
    test('200 response: success — no DB update and body drained', async () => {
      const bodyText = vi.fn().mockResolvedValue('')
      mockDeviceTokenFindMany.mockResolvedValueOnce([makeTokenRecord()])
      mockRequest.mockResolvedValueOnce({
        statusCode: 200,
        body: { text: bodyText },
      })

      await sendPush('user001', { aps: { alert: { title: 'T', body: 'B' } } })

      expect(mockDeviceTokenUpdate).not.toHaveBeenCalled()
      expect(bodyText).toHaveBeenCalled()
    })

    test('410 response: soft-revokes the device token and drains body', async () => {
      const bodyText = vi.fn().mockResolvedValue('Unregistered')
      const token = makeTokenRecord({ token: 'stale-tok', userId: 'user001' })
      mockDeviceTokenFindMany.mockResolvedValueOnce([token])
      mockRequest.mockResolvedValueOnce({
        statusCode: 410,
        body: { text: bodyText },
      })
      mockDeviceTokenUpdate.mockResolvedValueOnce({})

      await sendPush('user001', { aps: { alert: { title: 'T', body: 'B' } } })

      expect(mockDeviceTokenUpdate).toHaveBeenCalledWith({
        where: { token_environment: { token: 'stale-tok', environment: 'SANDBOX' } },
        data: { revokedAt: expect.any(Date) },
      })
      expect(bodyText).toHaveBeenCalled()
    })

    test('410 response: does not throw even if DB update fails', async () => {
      mockDeviceTokenFindMany.mockResolvedValueOnce([makeTokenRecord({ token: 'stale-tok' })])
      mockRequest.mockResolvedValueOnce({
        statusCode: 410,
        body: { text: vi.fn().mockResolvedValue('Unregistered') },
      })
      mockDeviceTokenUpdate.mockRejectedValueOnce(new Error('DB error'))

      // Should not throw — the .catch() in apns.ts swallows the error
      await expect(
        sendPush('user001', { aps: { alert: { title: 'T', body: 'B' } } }),
      ).resolves.toBeUndefined()

      expect(consoleSpy).toHaveBeenCalledWith(
        '[APNs] Failed to revoke stale device token',
        expect.any(Error),
      )
    })

    test('4xx/5xx response: logs error but does not throw (allSettled)', async () => {
      mockDeviceTokenFindMany.mockResolvedValueOnce([makeTokenRecord({ token: 'tok-bad' })])
      mockRequest.mockResolvedValueOnce({
        statusCode: 400,
        body: { text: vi.fn().mockResolvedValue('BadDeviceToken') },
      })

      await expect(
        sendPush('user001', { aps: { alert: { title: 'T', body: 'B' } } }),
      ).resolves.toBeUndefined()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[APNs] Push failed for device'),
      )
    })
  })

  describe('JWT caching', () => {
    test('second call within 55 min returns cached token — importPKCS8 called only once', async () => {
      // Use a fresh module instance to avoid cache pollution from other tests
      vi.resetModules()
      // Re-register mocks since resetModules clears the module registry
      vi.mock('undici', () => {
        function Pool(_origin: string, _opts?: unknown) {
          return { request: mockRequest }
        }
        return { Pool }
      })
      vi.mock('jose', () => {
        function SignJWT(_payload: unknown) {
          return {
            setProtectedHeader: vi.fn().mockReturnThis(),
            setIssuedAt: vi.fn().mockReturnThis(),
            setIssuer: vi.fn().mockReturnThis(),
            sign: mockSign,
          }
        }
        return { importPKCS8: mockImportPKCS8, SignJWT }
      })

      const baseTime = 1_000_000_000_000
      // First call at baseTime, second call (within 55 min) at baseTime + 10 min
      dateSpy = vi.spyOn(Date, 'now')
        .mockReturnValueOnce(baseTime)       // first getApnsJwt issuedAt
        .mockReturnValueOnce(baseTime + 10 * 60 * 1000)  // second getApnsJwt now check

      mockDeviceTokenFindMany.mockResolvedValue([makeTokenRecord()])

      const { sendPush: freshSendPush } = await import('./apns')

      await freshSendPush('user001', { aps: { alert: { title: 'T', body: 'B' } } })
      await freshSendPush('user001', { aps: { alert: { title: 'T', body: 'B' } } })

      // importPKCS8 should only be called once (cache hit on second call)
      expect(mockImportPKCS8).toHaveBeenCalledTimes(1)
    })

    test('call after 55 min generates a new token', async () => {
      vi.resetModules()
      vi.mock('undici', () => {
        function Pool(_origin: string, _opts?: unknown) {
          return { request: mockRequest }
        }
        return { Pool }
      })
      vi.mock('jose', () => {
        function SignJWT(_payload: unknown) {
          return {
            setProtectedHeader: vi.fn().mockReturnThis(),
            setIssuedAt: vi.fn().mockReturnThis(),
            setIssuer: vi.fn().mockReturnThis(),
            sign: mockSign,
          }
        }
        return { importPKCS8: mockImportPKCS8, SignJWT }
      })

      const baseTime = 1_000_000_000_000
      // First call at baseTime, second call past the 55-min window
      dateSpy = vi.spyOn(Date, 'now')
        .mockReturnValueOnce(baseTime)       // first getApnsJwt issuedAt
        .mockReturnValueOnce(baseTime + 56 * 60 * 1000)  // second getApnsJwt — cache expired

      mockSign.mockResolvedValueOnce('jwt-first').mockResolvedValueOnce('jwt-second')
      mockDeviceTokenFindMany.mockResolvedValue([makeTokenRecord()])

      const { sendPush: freshSendPush } = await import('./apns')

      await freshSendPush('user001', { aps: { alert: { title: 'T', body: 'B' } } })
      await freshSendPush('user001', { aps: { alert: { title: 'T', body: 'B' } } })

      // importPKCS8 should be called twice — cache expired between calls
      expect(mockImportPKCS8).toHaveBeenCalledTimes(2)
    })
  })

  describe('APNs preflight failures', () => {
    test('missing bundleId: returns early without querying tokens or dispatching', async () => {
      mockUseRuntimeConfig.mockReturnValueOnce({
        apnsTeamId: 'TEAM123456',
        apnsKeyId: 'KEY1234567',
        apnsPrivateKey: FAKE_PRIVATE_KEY_B64,
        appleBundleId: '',
      })

      await expect(
        sendPush('user001', { aps: { alert: { title: 'T', body: 'B' } } }),
      ).resolves.toBeUndefined()

      expect(mockDeviceTokenFindMany).not.toHaveBeenCalled()
      expect(mockRequest).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith(
        '[APNs] Missing appleBundleId; skipping push dispatch',
      )
    })

    test('findMany rejection: logged and contained — no dispatch, no throw', async () => {
      const dbError = new Error('DB unreachable')
      mockDeviceTokenFindMany.mockRejectedValueOnce(dbError)

      await expect(
        sendPush('user001', { aps: { alert: { title: 'T', body: 'B' } } }),
      ).resolves.toBeUndefined()

      expect(mockRequest).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith('[APNs] Failed to load device tokens', dbError)
    })
  })

  describe('APNs configuration errors', () => {
    test('incomplete config: sendPush resolves (error contained by allSettled)', async () => {
      // Reset module registry so the JWT cache from earlier tests is not reused
      vi.resetModules()
      mockUseRuntimeConfig.mockReturnValue({
        apnsTeamId: '',
        apnsKeyId: '',
        apnsPrivateKey: '',
        appleBundleId: 'com.example.app',
      })
      mockDeviceTokenFindMany.mockResolvedValueOnce([makeTokenRecord()])

      const { sendPush: freshSendPush } = await import('./apns')

      // sendPush uses Promise.allSettled — individual device errors don't propagate
      await expect(
        freshSendPush('user001', { aps: { alert: { title: 'T', body: 'B' } } }),
      ).resolves.toBeUndefined()
    })
  })
})
