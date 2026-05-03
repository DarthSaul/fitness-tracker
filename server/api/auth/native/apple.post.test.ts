import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

import handler from './apple.post'

const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockVerifyAppleIdentityToken = verifyAppleIdentityToken as ReturnType<typeof vi.fn>
const mockIsEmailAllowed = isEmailAllowed as ReturnType<typeof vi.fn>
const mockSignAccessToken = signAccessToken as ReturnType<typeof vi.fn>
const mockGetHeader = getHeader as ReturnType<typeof vi.fn>
const mockFindOrLinkUser = findOrLinkUser as ReturnType<typeof vi.fn>
const mockPrismaRefreshTokenCreate = (prisma as any).refreshToken.create as ReturnType<typeof vi.fn>

function makeEvent() {
  return { path: '/api/auth/native/apple', context: {} } as any
}

const mockApplePayload = { sub: 'apple-sub-001', email: 'apple@example.com' }
const mockDbUser = {
  id: 'cluser001',
  email: 'apple@example.com',
  name: 'Jane Appleseed',
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('POST /api/auth/native/apple', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockIsEmailAllowed.mockReturnValue(true)
    mockSignAccessToken.mockResolvedValue('access-token-abc')
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
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'identityToken is required' })
    })

    test('throws 400 when identityToken is missing', async () => {
      mockReadBody.mockResolvedValueOnce({})
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'identityToken is required' })
    })

    test('throws 400 when identityToken is empty string', async () => {
      mockReadBody.mockResolvedValueOnce({ identityToken: '' })
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'identityToken is required' })
    })

    test('throws 400 when identityToken is whitespace only', async () => {
      mockReadBody.mockResolvedValueOnce({ identityToken: '   ' })
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'identityToken is required' })
    })
  })

  describe('identity token verification', () => {
    test('throws 401 when verifyAppleIdentityToken rejects with a JWT credential error', async () => {
      mockReadBody.mockResolvedValueOnce({ identityToken: 'bad-token' })
      const jwtError = Object.assign(new Error('JWT expired'), { code: 'ERR_JWT_EXPIRED' })
      mockVerifyAppleIdentityToken.mockRejectedValueOnce(jwtError)
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Invalid Apple identity token' })
    })

    test('throws 401 when verifyAppleIdentityToken rejects with a JWS signature error', async () => {
      mockReadBody.mockResolvedValueOnce({ identityToken: 'tampered-token' })
      const jwsError = Object.assign(new Error('signature verification failed'), { code: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED' })
      mockVerifyAppleIdentityToken.mockRejectedValueOnce(jwsError)
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Invalid Apple identity token' })
    })

    test('propagates as 500 when verifyAppleIdentityToken rejects with an infrastructure error', async () => {
      mockReadBody.mockResolvedValueOnce({ identityToken: 'valid-token' })
      const infraError = Object.assign(new Error('JWKS fetch timed out'), { code: 'ERR_JWKS_TIMEOUT' })
      mockVerifyAppleIdentityToken.mockRejectedValueOnce(infraError)
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 500 })
    })

    test('logs the error on infrastructure failure', async () => {
      mockReadBody.mockResolvedValueOnce({ identityToken: 'valid-token' })
      const infraError = Object.assign(new Error('JWKS fetch timed out'), { code: 'ERR_JWKS_TIMEOUT' })
      mockVerifyAppleIdentityToken.mockRejectedValueOnce(infraError)
      try {
        await handler(makeEvent())
      } catch {
        // expected
      }
      expect(consoleSpy).toHaveBeenCalledWith('[POST /api/auth/native/apple] JWKS or infrastructure error', expect.any(Error))
    })

    test('throws 401 when Apple payload has no email', async () => {
      mockReadBody.mockResolvedValueOnce({ identityToken: 'valid-token' })
      mockVerifyAppleIdentityToken.mockResolvedValueOnce({ sub: 'apple-sub-001' })
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Invalid Apple identity token' })
    })
  })

  describe('allow-list check', () => {
    test('throws 403 when email is not on the allow-list', async () => {
      mockReadBody.mockResolvedValueOnce({ identityToken: 'valid-token' })
      mockVerifyAppleIdentityToken.mockResolvedValueOnce(mockApplePayload)
      mockIsEmailAllowed.mockReturnValueOnce(false)
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 403, statusMessage: 'You are not invited to use this app.' })
    })
  })

  describe('happy path', () => {
    beforeEach(() => {
      mockReadBody.mockResolvedValueOnce({
        identityToken: 'valid-identity-token',
        fullName: { givenName: 'Jane', familyName: 'Appleseed' },
      })
      mockVerifyAppleIdentityToken.mockResolvedValueOnce(mockApplePayload)
    })

    test('returns accessToken and refreshToken', async () => {
      const result = await handler(makeEvent())
      expect(result).toHaveProperty('accessToken', 'access-token-abc')
      expect(result).toHaveProperty('refreshToken')
      expect(typeof (result as any).refreshToken).toBe('string')
    })

    test('calls findOrLinkUser with the apple provider profile', async () => {
      await handler(makeEvent())
      expect(mockFindOrLinkUser).toHaveBeenCalledWith({
        provider: 'apple',
        providerId: 'apple-sub-001',
        email: 'apple@example.com',
        name: 'Jane Appleseed',
      })
    })

    test('creates a refresh token record', async () => {
      await handler(makeEvent())
      expect(mockPrismaRefreshTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'cluser001',
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
      // Raw token is 2× UUID = 72 chars; SHA-256 hex is always 64 chars
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

  describe('name handling edge cases', () => {
    // The route passes `name: name ?? undefined` to findOrLinkUser, so when no
    // fullName is sent (subsequent sign-ins) the helper sees `name: undefined`
    // and skips the name field in its update/create — preserving any existing
    // name on the User row.
    test('passes name=undefined to findOrLinkUser when fullName is absent', async () => {
      mockReadBody.mockResolvedValueOnce({ identityToken: 'valid-identity-token' })
      mockVerifyAppleIdentityToken.mockResolvedValueOnce(mockApplePayload)
      await handler(makeEvent())
      const arg = mockFindOrLinkUser.mock.calls[0]?.[0] as { name?: string | null }
      expect(arg.name).toBeUndefined()
    })

    test('uses only givenName when familyName is null', async () => {
      mockReadBody.mockResolvedValueOnce({
        identityToken: 'valid-identity-token',
        fullName: { givenName: 'Jane', familyName: null },
      })
      mockVerifyAppleIdentityToken.mockResolvedValueOnce(mockApplePayload)
      await handler(makeEvent())
      expect(mockFindOrLinkUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'Jane' }))
    })

    test('treats non-string givenName as null without throwing', async () => {
      mockReadBody.mockResolvedValueOnce({
        identityToken: 'valid-identity-token',
        fullName: { givenName: 123, familyName: 'Appleseed' },
      })
      mockVerifyAppleIdentityToken.mockResolvedValueOnce(mockApplePayload)
      await handler(makeEvent())
      expect(mockFindOrLinkUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'Appleseed' }))
    })

    test('treats non-string familyName as null without throwing', async () => {
      mockReadBody.mockResolvedValueOnce({
        identityToken: 'valid-identity-token',
        fullName: { givenName: 'Jane', familyName: 456 },
      })
      mockVerifyAppleIdentityToken.mockResolvedValueOnce(mockApplePayload)
      await handler(makeEvent())
      expect(mockFindOrLinkUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'Jane' }))
    })

    test('passes name=undefined when both fullName fields are non-string', async () => {
      mockReadBody.mockResolvedValueOnce({
        identityToken: 'valid-identity-token',
        fullName: { givenName: true, familyName: [] },
      })
      mockVerifyAppleIdentityToken.mockResolvedValueOnce(mockApplePayload)
      await handler(makeEvent())
      const arg = mockFindOrLinkUser.mock.calls[0]?.[0] as { name?: string | null }
      expect(arg.name).toBeUndefined()
    })
  })

  describe('error handling', () => {
    test('throws 500 on unexpected DB error', async () => {
      mockReadBody.mockResolvedValueOnce({ identityToken: 'valid-identity-token' })
      mockVerifyAppleIdentityToken.mockResolvedValueOnce(mockApplePayload)
      mockFindOrLinkUser.mockRejectedValueOnce(new Error('DB connection lost'))
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 500 })
    })

    test('logs the error on unexpected failure', async () => {
      mockReadBody.mockResolvedValueOnce({ identityToken: 'valid-identity-token' })
      mockVerifyAppleIdentityToken.mockResolvedValueOnce(mockApplePayload)
      mockFindOrLinkUser.mockRejectedValueOnce(new Error('DB connection lost'))
      try {
        await handler(makeEvent())
      } catch {
        // expected
      }
      expect(consoleSpy).toHaveBeenCalledWith('[POST /api/auth/native/apple] Failed', expect.any(Error))
    })

    test('re-throws H3 errors without wrapping', async () => {
      mockReadBody.mockResolvedValueOnce({ identityToken: 'valid-identity-token' })
      mockVerifyAppleIdentityToken.mockResolvedValueOnce(mockApplePayload)
      mockIsEmailAllowed.mockReturnValueOnce(false)
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 403 })
      expect(consoleSpy).not.toHaveBeenCalled()
    })
  })
})
