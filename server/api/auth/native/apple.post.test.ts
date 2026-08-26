import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

import handler from './apple.post'

const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockVerifyAppleIdentityToken = verifyAppleIdentityToken as ReturnType<typeof vi.fn>
const mockFindOrLinkUser = findOrLinkUser as ReturnType<typeof vi.fn>
const mockIssueTokenPair = issueTokenPair as ReturnType<typeof vi.fn>

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
    mockFindOrLinkUser.mockResolvedValue(mockDbUser)
    mockIssueTokenPair.mockResolvedValue({ accessToken: 'access-token-abc', refreshToken: 'refresh-raw-abc' })
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
      expect(logger.error).toHaveBeenCalledWith({ err: expect.any(Error), route: 'POST /api/auth/native/apple' }, '[POST /api/auth/native/apple] JWKS or infrastructure error')
    })

    test('throws 401 when Apple payload has no email', async () => {
      mockReadBody.mockResolvedValueOnce({ identityToken: 'valid-token' })
      mockVerifyAppleIdentityToken.mockResolvedValueOnce({ sub: 'apple-sub-001' })
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Invalid Apple identity token' })
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

    test('returns the token pair from issueTokenPair', async () => {
      const result = await handler(makeEvent())
      expect(result).toEqual({ accessToken: 'access-token-abc', refreshToken: 'refresh-raw-abc' })
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

    // Minting mechanics (hashing, expiry, deviceInfo) are covered by
    // server/utils/native-tokens.test.ts
    test('issues the token pair for the resolved user', async () => {
      const event = makeEvent()
      await handler(event)
      expect(mockIssueTokenPair).toHaveBeenCalledWith(event, 'cluser001')
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
      expect(logger.error).toHaveBeenCalledWith({ err: expect.any(Error), route: 'POST /api/auth/native/apple' }, '[POST /api/auth/native/apple] Failed')
    })

    // 4xx thrown from inside the try block must surface unchanged and unlogged —
    // sentry.server.config.ts filters client errors, and wrapping one as a 500
    // would both mislead the caller and pollute the dashboard.
    test('re-throws H3 errors without wrapping', async () => {
      mockReadBody.mockResolvedValueOnce({ identityToken: 'valid-identity-token' })
      mockVerifyAppleIdentityToken.mockResolvedValueOnce(mockApplePayload)
      mockFindOrLinkUser.mockRejectedValueOnce(
        createError({ statusCode: 409, statusMessage: 'Identity already linked to another account.' }),
      )
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 409 })
      expect(logger.error).not.toHaveBeenCalled()
    })
  })
})
