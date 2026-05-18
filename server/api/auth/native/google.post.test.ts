import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

import handler from './google.post'

const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockVerifyGoogleIdToken = verifyGoogleIdToken as ReturnType<typeof vi.fn>
const mockIsEmailAllowed = isEmailAllowed as ReturnType<typeof vi.fn>
const mockSignAccessToken = signAccessToken as ReturnType<typeof vi.fn>
const mockGetHeader = getHeader as ReturnType<typeof vi.fn>
const mockFindOrLinkUser = findOrLinkUser as ReturnType<typeof vi.fn>
const mockPrismaRefreshTokenCreate = (prisma as any).refreshToken.create as ReturnType<typeof vi.fn>

function makeEvent() {
  return { path: '/api/auth/native/google', context: {} } as any
}

const mockGooglePayload = {
  sub: 'google-sub-001',
  email: 'google@example.com',
  name: 'John Smith',
  picture: 'https://example.com/photo.jpg',
}

const mockDbUser = {
  id: 'cluser002',
  email: 'google@example.com',
  name: 'John Smith',
  avatarUrl: 'https://example.com/photo.jpg',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('POST /api/auth/native/google', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockIsEmailAllowed.mockReturnValue(true)
    mockSignAccessToken.mockResolvedValue('access-token-xyz')
    mockGetHeader.mockReturnValue('TestApp/1.0')
    mockFindOrLinkUser.mockResolvedValue(mockDbUser)
    mockPrismaRefreshTokenCreate.mockResolvedValue({})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('request validation', () => {
    test('throws 400 when body is null', async () => {
      mockReadBody.mockResolvedValueOnce(null)
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'idToken is required' })
    })

    test('throws 400 when idToken is missing', async () => {
      mockReadBody.mockResolvedValueOnce({})
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'idToken is required' })
    })

    test('throws 400 when idToken is empty string', async () => {
      mockReadBody.mockResolvedValueOnce({ idToken: '' })
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'idToken is required' })
    })

    test('throws 400 when idToken is whitespace only', async () => {
      mockReadBody.mockResolvedValueOnce({ idToken: '   ' })
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'idToken is required' })
    })
  })

  describe('identity token verification', () => {
    test('throws 401 when verifyGoogleIdToken rejects with a JWT credential error', async () => {
      mockReadBody.mockResolvedValueOnce({ idToken: 'bad-token' })
      const jwtError = Object.assign(new Error('JWT expired'), { code: 'ERR_JWT_EXPIRED' })
      mockVerifyGoogleIdToken.mockRejectedValueOnce(jwtError)
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Invalid Google ID token' })
    })

    test('throws 401 when verifyGoogleIdToken rejects with a JWS signature error', async () => {
      mockReadBody.mockResolvedValueOnce({ idToken: 'tampered-token' })
      const jwsError = Object.assign(new Error('signature verification failed'), { code: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED' })
      mockVerifyGoogleIdToken.mockRejectedValueOnce(jwsError)
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Invalid Google ID token' })
    })

    test('throws 401 when verifyGoogleIdToken rejects with missing email claim error', async () => {
      mockReadBody.mockResolvedValueOnce({ idToken: 'valid-token' })
      mockVerifyGoogleIdToken.mockRejectedValueOnce(new Error('Google ID token missing email claim'))
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Invalid Google ID token' })
    })

    test('propagates as 500 when verifyGoogleIdToken rejects with an infrastructure error', async () => {
      mockReadBody.mockResolvedValueOnce({ idToken: 'valid-token' })
      const infraError = Object.assign(new Error('JWKS fetch timed out'), { code: 'ERR_JWKS_TIMEOUT' })
      mockVerifyGoogleIdToken.mockRejectedValueOnce(infraError)
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 500 })
    })
  })

  describe('allow-list check', () => {
    test('throws 403 when email is not on the allow-list', async () => {
      mockReadBody.mockResolvedValueOnce({ idToken: 'valid-token' })
      mockVerifyGoogleIdToken.mockResolvedValueOnce(mockGooglePayload)
      mockIsEmailAllowed.mockReturnValueOnce(false)
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 403, statusMessage: 'You are not invited to use this app.' })
    })
  })

  describe('happy path', () => {
    beforeEach(() => {
      mockReadBody.mockResolvedValueOnce({ idToken: 'valid-id-token' })
      mockVerifyGoogleIdToken.mockResolvedValueOnce(mockGooglePayload)
    })

    test('returns accessToken and refreshToken', async () => {
      const result = await handler(makeEvent())
      expect(result).toHaveProperty('accessToken', 'access-token-xyz')
      expect(result).toHaveProperty('refreshToken')
      expect(typeof (result as any).refreshToken).toBe('string')
    })

    test('calls findOrLinkUser with the google provider profile', async () => {
      await handler(makeEvent())
      expect(mockFindOrLinkUser).toHaveBeenCalledWith({
        provider: 'google',
        providerId: 'google-sub-001',
        email: 'google@example.com',
        name: 'John Smith',
        avatarUrl: 'https://example.com/photo.jpg',
      })
    })

    test('creates a refresh token record', async () => {
      await handler(makeEvent())
      expect(mockPrismaRefreshTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'cluser002',
            expiresAt: expect.any(Date),
          }),
        }),
      )
    })

    test('stores a hashed token (not the raw value)', async () => {
      await handler(makeEvent())
      const createArg = mockPrismaRefreshTokenCreate.mock.calls[0]?.[0] as {
        data: { tokenHash: string }
      }
      expect(createArg.data.tokenHash).toHaveLength(64)
    })

    test('stores deviceInfo from user-agent header', async () => {
      await handler(makeEvent())
      expect(mockPrismaRefreshTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deviceInfo: 'TestApp/1.0' }),
        }),
      )
    })
  })

  describe('omitted profile fields', () => {
    // We pass `?? undefined` so the helper preserves whatever's already on
    // the User row (existing identity refresh path) instead of clearing it.
    test('passes name=undefined to findOrLinkUser when Google provides none', async () => {
      mockReadBody.mockResolvedValueOnce({ idToken: 'valid-id-token' })
      mockVerifyGoogleIdToken.mockResolvedValueOnce({
        sub: 'google-sub-002',
        email: 'google2@example.com',
      })
      mockFindOrLinkUser.mockResolvedValueOnce({ ...mockDbUser, name: null })
      const result = await handler(makeEvent())
      const arg = mockFindOrLinkUser.mock.calls[0]?.[0] as { name?: string | null }
      expect(arg.name).toBeUndefined()
      expect(result).toHaveProperty('accessToken')
    })

    test('passes avatarUrl=undefined to findOrLinkUser when Google provides no picture', async () => {
      mockReadBody.mockResolvedValueOnce({ idToken: 'valid-id-token' })
      mockVerifyGoogleIdToken.mockResolvedValueOnce({
        sub: 'google-sub-003',
        email: 'google3@example.com',
        name: 'No Avatar',
      })
      mockFindOrLinkUser.mockResolvedValueOnce({ ...mockDbUser, avatarUrl: null })
      await handler(makeEvent())
      const arg = mockFindOrLinkUser.mock.calls[0]?.[0] as { avatarUrl?: string | null }
      expect(arg.avatarUrl).toBeUndefined()
    })
  })

  describe('error handling', () => {
    test('throws 500 on unexpected DB error', async () => {
      mockReadBody.mockResolvedValueOnce({ idToken: 'valid-id-token' })
      mockVerifyGoogleIdToken.mockResolvedValueOnce(mockGooglePayload)
      mockFindOrLinkUser.mockRejectedValueOnce(new Error('DB connection lost'))
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 500 })
    })

    test('logs the error on unexpected failure', async () => {
      mockReadBody.mockResolvedValueOnce({ idToken: 'valid-id-token' })
      mockVerifyGoogleIdToken.mockResolvedValueOnce(mockGooglePayload)
      mockFindOrLinkUser.mockRejectedValueOnce(new Error('DB connection lost'))
      try {
        await handler(makeEvent())
      } catch {
        // expected
      }
      expect(logger.error).toHaveBeenCalledWith({ err: expect.any(Error), route: 'POST /api/auth/native/google' }, '[POST /api/auth/native/google] Failed')
    })

    test('re-throws H3 errors without wrapping', async () => {
      mockReadBody.mockResolvedValueOnce({ idToken: 'valid-id-token' })
      mockVerifyGoogleIdToken.mockResolvedValueOnce(mockGooglePayload)
      mockIsEmailAllowed.mockReturnValueOnce(false)
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 403 })
      expect(logger.error).not.toHaveBeenCalled()
    })
  })
})
