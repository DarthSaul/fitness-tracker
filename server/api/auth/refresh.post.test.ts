import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

import handler from './refresh.post'

const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockRefreshTokenFindUnique = (prisma as any).refreshToken.findUnique as ReturnType<typeof vi.fn>
const mockRefreshTokenUpdateMany = (prisma as any).refreshToken.updateMany as ReturnType<typeof vi.fn>
const mockRefreshTokenCreate = (prisma as any).refreshToken.create as ReturnType<typeof vi.fn>
const mockPrismaTransaction = (prisma as any).$transaction as ReturnType<typeof vi.fn>
const mockSignAccessToken = signAccessToken as ReturnType<typeof vi.fn>

function makeEvent() {
  return { path: '/api/auth/refresh', context: {} } as any
}

function makeStoredToken(overrides: Partial<{
  id: string
  userId: string
  tokenHash: string
  expiresAt: Date
  revokedAt: Date | null
  lastUsedAt: Date | null
  deviceInfo: string | null
}> = {}) {
  return {
    id: 'clrtoken001',
    userId: 'cluser001',
    tokenHash: 'hash-placeholder',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    lastUsedAt: null,
    deviceInfo: 'TestDevice/1.0',
    ...overrides,
  }
}

describe('POST /api/auth/refresh', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.NUXT_JWT_REFRESH_ROTATION
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Default: updateMany succeeds (count: 1) so rotation/happy-path tests don't need extra setup
    mockRefreshTokenUpdateMany.mockResolvedValue({ count: 1 })
    // Default: transaction calls the callback with a tx object backed by the prisma mock
    mockPrismaTransaction.mockImplementation(async (cb: (tx: any) => Promise<any>) =>
      cb({ refreshToken: { updateMany: mockRefreshTokenUpdateMany, create: mockRefreshTokenCreate } }),
    )
    mockSignAccessToken.mockResolvedValue('new-access-token')
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('request validation', () => {
    test('throws 400 when body is null', async () => {
      mockReadBody.mockResolvedValueOnce(null)
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 400 })
    })

    test('throws 400 when refreshToken field is missing', async () => {
      mockReadBody.mockResolvedValueOnce({})
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 400 })
    })

    test('throws 400 when refreshToken is empty string', async () => {
      mockReadBody.mockResolvedValueOnce({ refreshToken: '' })
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 400 })
    })
  })

  describe('token validation', () => {
    test('throws 401 when token hash is not found in DB', async () => {
      mockReadBody.mockResolvedValueOnce({ refreshToken: 'unknown-token' })
      mockRefreshTokenFindUnique.mockResolvedValueOnce(null)
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 401 })
    })

    test('throws 401 when token is expired', async () => {
      mockReadBody.mockResolvedValueOnce({ refreshToken: 'expired-token' })
      mockRefreshTokenFindUnique.mockResolvedValueOnce(
        makeStoredToken({ expiresAt: new Date(Date.now() - 1000) }),
      )
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Refresh token expired' })
    })

    test('throws 401 when token is revoked', async () => {
      mockReadBody.mockResolvedValueOnce({ refreshToken: 'revoked-token' })
      mockRefreshTokenFindUnique.mockResolvedValueOnce(
        makeStoredToken({ revokedAt: new Date() }),
      )
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Refresh token revoked' })
    })
  })

  describe('happy path (no rotation)', () => {
    beforeEach(() => {
      mockReadBody.mockResolvedValueOnce({ refreshToken: 'valid-raw-token' })
      mockRefreshTokenFindUnique.mockResolvedValueOnce(makeStoredToken())
    })

    test('returns a new accessToken', async () => {
      const result = await handler(makeEvent())
      expect(result).toMatchObject({ accessToken: 'new-access-token' })
    })

    test('does not return refreshToken when rotation is disabled', async () => {
      const result = await handler(makeEvent())
      expect(result).not.toHaveProperty('refreshToken')
    })

    test('calls signAccessToken with the stored userId', async () => {
      await handler(makeEvent())
      expect(mockSignAccessToken).toHaveBeenCalledWith('cluser001')
    })

    test('updates lastUsedAt in a transaction', async () => {
      await handler(makeEvent())
      expect(mockPrismaTransaction).toHaveBeenCalledOnce()
      expect(mockRefreshTokenUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'clrtoken001' }),
          data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
        }),
      )
    })

    test('does not set revokedAt when rotation is disabled', async () => {
      await handler(makeEvent())
      expect(mockRefreshTokenUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.not.objectContaining({ revokedAt: expect.anything() }) }),
      )
    })
  })

  describe('happy path (rotation enabled)', () => {
    beforeEach(() => {
      process.env.NUXT_JWT_REFRESH_ROTATION = 'true'
      mockReadBody.mockResolvedValueOnce({ refreshToken: 'valid-raw-token' })
      mockRefreshTokenFindUnique.mockResolvedValueOnce(makeStoredToken({ deviceInfo: 'iOS/17.0' }))
    })

    test('returns both accessToken and refreshToken', async () => {
      const result = await handler(makeEvent())
      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
      expect(typeof (result as any).refreshToken).toBe('string')
    })

    test('revokes the old token (sets revokedAt)', async () => {
      await handler(makeEvent())
      expect(mockRefreshTokenUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      )
    })

    test('creates a new refresh token record with matching deviceInfo', async () => {
      await handler(makeEvent())
      expect(mockRefreshTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'cluser001',
            deviceInfo: 'iOS/17.0',
            expiresAt: expect.any(Date),
          }),
        }),
      )
    })
  })

  describe('error handling', () => {
    test('throws 500 on unexpected DB error', async () => {
      mockReadBody.mockResolvedValueOnce({ refreshToken: 'some-token' })
      mockRefreshTokenFindUnique.mockRejectedValueOnce(new Error('DB connection lost'))
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 500 })
    })

    test('logs the error on unexpected failure', async () => {
      mockReadBody.mockResolvedValueOnce({ refreshToken: 'some-token' })
      mockRefreshTokenFindUnique.mockRejectedValueOnce(new Error('DB connection lost'))
      try {
        await handler(makeEvent())
      } catch {
        // expected
      }
      expect(consoleSpy).toHaveBeenCalledWith(
        '[POST /api/auth/refresh] Failed to refresh token',
        expect.any(Error),
      )
    })

    test('re-throws H3 errors without wrapping as 500', async () => {
      mockReadBody.mockResolvedValueOnce({ refreshToken: 'expired-token' })
      mockRefreshTokenFindUnique.mockResolvedValueOnce(
        makeStoredToken({ expiresAt: new Date(Date.now() - 1000) }),
      )
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 401 })
      expect(consoleSpy).not.toHaveBeenCalled()
    })

    test('does not mutate the refresh token when signAccessToken fails', async () => {
      mockReadBody.mockResolvedValueOnce({ refreshToken: 'valid-raw-token' })
      mockRefreshTokenFindUnique.mockResolvedValueOnce(makeStoredToken())
      mockSignAccessToken.mockRejectedValueOnce(new Error('signing service unavailable'))
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 500 })
      expect(mockPrismaTransaction).not.toHaveBeenCalled()
    })
  })
})
