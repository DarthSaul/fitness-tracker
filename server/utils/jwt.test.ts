import { describe, test, expect, vi, beforeEach } from 'vitest'
import { SignJWT } from 'jose'
import { signAccessToken, signRefreshToken, verifyAccessToken, decodeUnverifiedSub } from './jwt'

// The test secret matches what vitest.setup.ts stubs into useRuntimeConfig
const TEST_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-chars-long'
const TEST_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-chars-long'

const mockUseRuntimeConfig = useRuntimeConfig as ReturnType<typeof vi.fn>

describe('server/utils/jwt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseRuntimeConfig.mockReturnValue({
      jwtAccessSecret: TEST_ACCESS_SECRET,
      jwtRefreshSecret: TEST_REFRESH_SECRET,
    })
  })

  describe('signAccessToken', () => {
    test('returns a non-empty JWT string', async () => {
      const token = await signAccessToken('user-abc')
      expect(typeof token).toBe('string')
      expect(token.split('.').length).toBe(3)
    })

    test('produces a token that verifyAccessToken accepts', async () => {
      const token = await signAccessToken('user-abc')
      const payload = await verifyAccessToken(token)
      expect(payload.sub).toBe('user-abc')
    })

    test('different userIds produce different tokens', async () => {
      const t1 = await signAccessToken('user-1')
      const t2 = await signAccessToken('user-2')
      expect(t1).not.toBe(t2)
    })
  })

  describe('signRefreshToken', () => {
    test('returns a valid JWT string', async () => {
      const token = await signRefreshToken('user-abc')
      expect(typeof token).toBe('string')
      expect(token.split('.').length).toBe(3)
    })

    test('is signed with the refresh secret (not the access secret)', async () => {
      const token = await signRefreshToken('user-abc')
      // verifyAccessToken uses the access secret — it must reject a refresh token
      await expect(verifyAccessToken(token)).rejects.toThrow()
    })
  })

  describe('verifyAccessToken', () => {
    test('rejects an expired token', async () => {
      const secret = new TextEncoder().encode(TEST_ACCESS_SECRET)
      const expired = await new SignJWT({ sub: 'user-abc' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('fitness-tracker')
        .setAudience('fitness-tracker-api')
        .setExpirationTime('-1s')
        .sign(secret)

      await expect(verifyAccessToken(expired)).rejects.toThrow()
    })

    test('rejects a token signed with the wrong secret', async () => {
      const wrongSecret = new TextEncoder().encode('completely-different-secret-at-least-32-chars')
      const token = await new SignJWT({ sub: 'user-abc' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('fitness-tracker')
        .setAudience('fitness-tracker-api')
        .setExpirationTime('15m')
        .sign(wrongSecret)

      await expect(verifyAccessToken(token)).rejects.toThrow()
    })

    test('rejects a token with wrong issuer', async () => {
      const secret = new TextEncoder().encode(TEST_ACCESS_SECRET)
      const token = await new SignJWT({ sub: 'user-abc' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('wrong-issuer')
        .setAudience('fitness-tracker-api')
        .setExpirationTime('15m')
        .sign(secret)

      await expect(verifyAccessToken(token)).rejects.toThrow()
    })

    test('rejects a token with wrong audience', async () => {
      const secret = new TextEncoder().encode(TEST_ACCESS_SECRET)
      const token = await new SignJWT({ sub: 'user-abc' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('fitness-tracker')
        .setAudience('wrong-audience')
        .setExpirationTime('15m')
        .sign(secret)

      await expect(verifyAccessToken(token)).rejects.toThrow()
    })

    test('rejects a plaintext string that is not a JWT', async () => {
      await expect(verifyAccessToken('not.a.jwt')).rejects.toThrow()
    })

    test('rejects a token with tokenType refresh even when signed with the access secret', async () => {
      const secret = new TextEncoder().encode(TEST_ACCESS_SECRET)
      const token = await new SignJWT({ sub: 'user-abc', tokenType: 'refresh' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('fitness-tracker')
        .setAudience('fitness-tracker-api')
        .setExpirationTime('15m')
        .sign(secret)
      await expect(verifyAccessToken(token)).rejects.toThrow()
    })
  })

  describe('missing secrets', () => {
    test('signAccessToken throws when jwtAccessSecret is absent', async () => {
      mockUseRuntimeConfig.mockReturnValueOnce({ jwtAccessSecret: '', jwtRefreshSecret: TEST_REFRESH_SECRET })
      await expect(signAccessToken('user-abc')).rejects.toThrow('JWT access secret is not configured')
    })

    test('signAccessToken does not throw when only jwtRefreshSecret is absent', async () => {
      mockUseRuntimeConfig.mockReturnValueOnce({ jwtAccessSecret: TEST_ACCESS_SECRET, jwtRefreshSecret: '' })
      await expect(signAccessToken('user-abc')).resolves.toBeDefined()
    })

    test('signRefreshToken throws when jwtRefreshSecret is absent', async () => {
      mockUseRuntimeConfig.mockReturnValueOnce({ jwtAccessSecret: TEST_ACCESS_SECRET, jwtRefreshSecret: '' })
      await expect(signRefreshToken('user-abc')).rejects.toThrow('JWT refresh secret is not configured')
    })

    test('signRefreshToken does not throw when only jwtAccessSecret is absent', async () => {
      mockUseRuntimeConfig.mockReturnValueOnce({ jwtAccessSecret: '', jwtRefreshSecret: TEST_REFRESH_SECRET })
      await expect(signRefreshToken('user-abc')).resolves.toBeDefined()
    })

    test('verifyAccessToken throws when jwtAccessSecret is absent', async () => {
      const token = await signAccessToken('user-abc')
      mockUseRuntimeConfig.mockReturnValueOnce({ jwtAccessSecret: '', jwtRefreshSecret: TEST_REFRESH_SECRET })
      await expect(verifyAccessToken(token)).rejects.toThrow('JWT access secret is not configured')
    })
  })

  describe('decodeUnverifiedSub', () => {
    test('extracts sub from a validly-signed token without needing the secret', async () => {
      const token = await signAccessToken('user-unverified-1')
      expect(decodeUnverifiedSub(token)).toBe('user-unverified-1')
    })

    test('extracts sub from an EXPIRED token (no claim validation)', async () => {
      // A token verifyAccessToken would reject (expired) must still yield its sub
      // for observability triage.
      const expired = await new SignJWT({ sub: 'user-expired', tokenType: 'access' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
        .sign(new TextEncoder().encode(TEST_ACCESS_SECRET))
      expect(decodeUnverifiedSub(expired)).toBe('user-expired')
    })

    test('extracts sub from a token signed with a DIFFERENT secret (signature not checked)', async () => {
      const forged = await new SignJWT({ sub: 'user-forged', tokenType: 'access' })
        .setProtectedHeader({ alg: 'HS256' })
        .sign(new TextEncoder().encode('a-totally-different-secret-that-is-32-chars'))
      expect(decodeUnverifiedSub(forged)).toBe('user-forged')
    })

    test('returns null for a malformed / non-JWT token', () => {
      expect(decodeUnverifiedSub('not-a-jwt')).toBeNull()
      expect(decodeUnverifiedSub('')).toBeNull()
      expect(decodeUnverifiedSub('a.b.c')).toBeNull()
    })

    test('returns null when the token has no sub claim', async () => {
      const noSub = await new SignJWT({ tokenType: 'access' })
        .setProtectedHeader({ alg: 'HS256' })
        .sign(new TextEncoder().encode(TEST_ACCESS_SECRET))
      expect(decodeUnverifiedSub(noSub)).toBeNull()
    })
  })
})
