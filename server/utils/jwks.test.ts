import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'mock-jwks-set'),
  jwtVerify: vi.fn(),
}))

import { jwtVerify } from 'jose'
import { verifyAppleIdentityToken, verifyGoogleIdToken } from './jwks'

const mockJwtVerify = vi.mocked(jwtVerify)
const mockUseRuntimeConfig = useRuntimeConfig as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockUseRuntimeConfig.mockReturnValue({
    appleBundleId: 'com.example.fitnesstracker',
    oauthGoogleClientId: 'google-client-id.apps.googleusercontent.com',
  })
})

describe('verifyAppleIdentityToken', () => {
  test('calls jwtVerify with Apple JWKS, correct issuer and bundle ID audience', async () => {
    mockJwtVerify.mockResolvedValueOnce({ payload: { sub: 'apple-sub-001', email: 'user@example.com' } } as any)
    await verifyAppleIdentityToken('token')
    expect(mockJwtVerify).toHaveBeenCalledWith('token', 'mock-jwks-set', {
      issuer: 'https://appleid.apple.com',
      audience: 'com.example.fitnesstracker',
    })
  })

  test('returns sub and email from payload', async () => {
    mockJwtVerify.mockResolvedValueOnce({ payload: { sub: 'apple-sub-001', email: 'user@icloud.com' } } as any)
    const result = await verifyAppleIdentityToken('token')
    expect(result).toEqual({ sub: 'apple-sub-001', email: 'user@icloud.com' })
  })

  test('returns undefined email when claim is absent', async () => {
    mockJwtVerify.mockResolvedValueOnce({ payload: { sub: 'apple-sub-002' } } as any)
    const result = await verifyAppleIdentityToken('token')
    expect(result.email).toBeUndefined()
  })

  test('rejects when jwtVerify throws', async () => {
    mockJwtVerify.mockRejectedValueOnce(new Error('JWTExpired'))
    await expect(verifyAppleIdentityToken('bad-token')).rejects.toThrow()
  })
})

describe('verifyGoogleIdToken', () => {
  test('calls jwtVerify with Google JWKS, both issuer forms, and client ID audience', async () => {
    mockJwtVerify.mockResolvedValueOnce({ payload: { sub: 'g-sub-001', email: 'user@gmail.com' } } as any)
    await verifyGoogleIdToken('token')
    expect(mockJwtVerify).toHaveBeenCalledWith('token', 'mock-jwks-set', {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: 'google-client-id.apps.googleusercontent.com',
    })
  })

  test('returns sub, email, name and picture from payload', async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: { sub: 'g-sub-001', email: 'user@gmail.com', name: 'Jane Doe', picture: 'https://example.com/photo.jpg' },
    } as any)
    const result = await verifyGoogleIdToken('token')
    expect(result).toEqual({ sub: 'g-sub-001', email: 'user@gmail.com', name: 'Jane Doe', picture: 'https://example.com/photo.jpg' })
  })

  test('returns undefined name and picture when absent', async () => {
    mockJwtVerify.mockResolvedValueOnce({ payload: { sub: 'g-sub-001', email: 'user@gmail.com' } } as any)
    const result = await verifyGoogleIdToken('token')
    expect(result.name).toBeUndefined()
    expect(result.picture).toBeUndefined()
  })

  test('throws when email claim is absent', async () => {
    mockJwtVerify.mockResolvedValueOnce({ payload: { sub: 'g-sub-001' } } as any)
    await expect(verifyGoogleIdToken('token')).rejects.toThrow('Google ID token missing email claim')
  })

  test('throws when email claim is an empty string', async () => {
    mockJwtVerify.mockResolvedValueOnce({ payload: { sub: 'g-sub-001', email: '' } } as any)
    await expect(verifyGoogleIdToken('token')).rejects.toThrow('Google ID token missing email claim')
  })

  test('throws when email claim is not a string', async () => {
    mockJwtVerify.mockResolvedValueOnce({ payload: { sub: 'g-sub-001', email: true } } as any)
    await expect(verifyGoogleIdToken('token')).rejects.toThrow('Google ID token missing email claim')
  })

  test('rejects when jwtVerify throws', async () => {
    mockJwtVerify.mockRejectedValueOnce(new Error('JWTExpired'))
    await expect(verifyGoogleIdToken('bad-token')).rejects.toThrow()
  })
})
