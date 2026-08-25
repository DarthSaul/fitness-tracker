import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { User } from '@prisma/client'

import handler from './signin.post'

const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockSupabaseSignIn = (supabase as typeof supabase).auth.signInWithPassword as ReturnType<typeof vi.fn>
const mockFindOrLinkUser = findOrLinkUser as ReturnType<typeof vi.fn>
const mockIssueTokenPair = issueTokenPair as ReturnType<typeof vi.fn>

const mockDbUser = {
  id: 'cluser001',
  email: 'test@example.com',
  name: 'Test User',
  avatarUrl: null,
  ptRoutineInWorkout: false,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies User

function makeEvent() {
  return { path: '/api/auth/native/email/signin', context: {} } as any
}

describe('POST /api/auth/native/email/signin', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFindOrLinkUser.mockResolvedValue(mockDbUser)
    mockIssueTokenPair.mockResolvedValue({ accessToken: 'access-token-xyz', refreshToken: 'refresh-raw-xyz' })
    mockSupabaseSignIn.mockResolvedValue({
      data: { user: { id: 'supabase-uid-001', email: 'test@example.com' }, session: {} },
      error: null,
    })
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('rate limiting', () => {
    test('rate limits by IP before reading the body', async () => {
      const mockRateLimit = rateLimitByIp as ReturnType<typeof vi.fn>
      mockRateLimit.mockRejectedValueOnce(createError({ statusCode: 429, statusMessage: 'Too many requests' }))

      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 429 })

      expect(mockReadBody).not.toHaveBeenCalled()
      expect(mockSupabaseSignIn).not.toHaveBeenCalled()
    })
  })

  describe('request validation', () => {
    test('throws 400 when body is null', async () => {
      mockReadBody.mockResolvedValueOnce(null)
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Email and password are required.' })
    })

    test('throws 400 when email is missing', async () => {
      mockReadBody.mockResolvedValueOnce({ password: 'testpass123' })
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Email and password are required.' })
    })

    test('throws 400 when password is missing', async () => {
      mockReadBody.mockResolvedValueOnce({ email: 'test@example.com' })
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Email and password are required.' })
    })
  })

  describe('credential failures', () => {
    test('throws a generic 401 on Supabase credential error', async () => {
      mockReadBody.mockResolvedValueOnce({ email: 'test@example.com', password: 'wrongpass' })
      mockSupabaseSignIn.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials', code: 'invalid_credentials' },
      })

      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Invalid email or password.' })
    })

    // Distinct message + machine-readable code so the iOS client can offer a
    // "resend confirmation" affordance. Safe re: enumeration — GoTrue only
    // reports this after the password verified.
    test('throws 401 with a distinct message and data code when email is not confirmed', async () => {
      mockReadBody.mockResolvedValueOnce({ email: 'test@example.com', password: 'testpass123' })
      mockSupabaseSignIn.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'Email not confirmed', code: 'email_not_confirmed' },
      })

      await expect(handler(makeEvent())).rejects.toMatchObject({
        statusCode: 401,
        statusMessage: 'Please confirm your email before signing in.',
        data: { code: 'email_not_confirmed' },
      })
    })
  })

  describe('happy path', () => {
    beforeEach(() => {
      mockReadBody.mockResolvedValueOnce({ email: 'test@example.com', password: 'testpass123' })
    })

    test('returns the token pair from issueTokenPair', async () => {
      const result = await handler(makeEvent())
      expect(result).toEqual({ accessToken: 'access-token-xyz', refreshToken: 'refresh-raw-xyz' })
    })

    // Exact-object match: no `name` key may be passed — supplying one on every
    // sign-in would overwrite a user-edited name via the profile refresh.
    test('calls findOrLinkUser with the email provider profile and no name', async () => {
      await handler(makeEvent())
      expect(mockFindOrLinkUser).toHaveBeenCalledWith({
        provider: 'email',
        providerId: 'supabase-uid-001',
        email: 'test@example.com',
      })
    })

    test('issues the token pair for the resolved user', async () => {
      const event = makeEvent()
      await handler(event)
      expect(mockIssueTokenPair).toHaveBeenCalledWith(event, 'cluser001')
    })
  })

  describe('error handling', () => {
    test('throws 500 on unexpected DB error', async () => {
      mockReadBody.mockResolvedValueOnce({ email: 'test@example.com', password: 'testpass123' })
      mockFindOrLinkUser.mockRejectedValueOnce(new Error('DB connection lost'))
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Sign-in failed. Please try again.' })
    })

    test('logs the error on unexpected failure', async () => {
      mockReadBody.mockResolvedValueOnce({ email: 'test@example.com', password: 'testpass123' })
      mockFindOrLinkUser.mockRejectedValueOnce(new Error('DB connection lost'))
      try {
        await handler(makeEvent())
      } catch {
        // expected
      }
      expect(logger.error).toHaveBeenCalledWith({ err: expect.any(Error), route: 'POST /api/auth/native/email/signin' }, '[POST /api/auth/native/email/signin] Failed')
    })

    // 4xx thrown from inside the try block must surface unchanged and unlogged —
    // sentry.server.config.ts filters client errors, and wrapping one as a 500
    // would both mislead the caller and pollute the dashboard.
    test('re-throws H3 errors without wrapping', async () => {
      mockReadBody.mockResolvedValueOnce({ email: 'test@example.com', password: 'testpass123' })
      mockFindOrLinkUser.mockRejectedValueOnce(
        createError({ statusCode: 409, statusMessage: 'Identity already linked to another account.' }),
      )
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 409 })
      expect(logger.error).not.toHaveBeenCalled()
    })
  })
})
