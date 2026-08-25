import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { User } from '@prisma/client'

import handler from './signup.post'

const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockSupabaseSignUp = (supabase as typeof supabase).auth.signUp as ReturnType<typeof vi.fn>
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
  return { path: '/api/auth/native/email/signup', context: {} } as any
}

describe('POST /api/auth/native/email/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIssueTokenPair.mockResolvedValue({ accessToken: 'access-token-xyz', refreshToken: 'refresh-raw-xyz' })
  })

  // Registration is open, so this endpoint is internet-facing and triggers
  // Supabase transactional email on every successful call.
  describe('rate limiting', () => {
    test('rate limits by IP before reading the body', async () => {
      const mockRateLimit = rateLimitByIp as ReturnType<typeof vi.fn>
      mockRateLimit.mockRejectedValueOnce(createError({ statusCode: 429, statusMessage: 'Too many requests' }))

      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 429 })

      expect(mockReadBody).not.toHaveBeenCalled()
      expect(mockSupabaseSignUp).not.toHaveBeenCalled()
    })
  })

  describe('request validation', () => {
    test('throws 400 when body is null', async () => {
      mockReadBody.mockResolvedValueOnce(null)
      await expect(handler(makeEvent())).rejects.toThrow('Email and password are required.')
    })

    test('throws 400 when email is missing', async () => {
      mockReadBody.mockResolvedValueOnce({ password: 'testpass123' })
      await expect(handler(makeEvent())).rejects.toThrow('Email and password are required.')
    })

    test('throws 400 when password is missing', async () => {
      mockReadBody.mockResolvedValueOnce({ email: 'test@example.com' })
      await expect(handler(makeEvent())).rejects.toThrow('Email and password are required.')
    })

    test('throws 400 when password is too short', async () => {
      mockReadBody.mockResolvedValueOnce({ email: 'test@example.com', password: 'short' })
      await expect(handler(makeEvent())).rejects.toThrow('Password must be at least 8 characters.')
    })
  })

  describe('Supabase sign-up failures', () => {
    test('throws 400 with the Supabase message when signUp errors', async () => {
      mockReadBody.mockResolvedValueOnce({ email: 'test@example.com', password: 'testpass123' })
      mockSupabaseSignUp.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'User already registered' },
      })

      await expect(handler(makeEvent())).rejects.toThrow('User already registered')
    })

    test('throws 400 when Supabase returns no user', async () => {
      mockReadBody.mockResolvedValueOnce({ email: 'test@example.com', password: 'testpass123' })
      mockSupabaseSignUp.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: null,
      })

      await expect(handler(makeEvent())).rejects.toThrow('Sign-up failed. Please try again.')
    })

    test('throws 400 when email already exists (empty identities)', async () => {
      mockReadBody.mockResolvedValueOnce({ email: 'test@example.com', password: 'testpass123' })
      mockSupabaseSignUp.mockResolvedValueOnce({
        data: {
          user: { id: 'supabase-uid-001', identities: [] },
          session: null,
        },
        error: null,
      })

      await expect(handler(makeEvent())).rejects.toThrow('An account with this email already exists.')
    })
  })

  describe('confirmation required (no session)', () => {
    beforeEach(() => {
      mockReadBody.mockResolvedValueOnce({ email: 'test@example.com', password: 'testpass123', name: 'Test User' })
      mockSupabaseSignUp.mockResolvedValueOnce({
        data: {
          user: { id: 'supabase-uid-001', identities: [{ id: '1' }] },
          session: null,
        },
        error: null,
      })
    })

    test('returns confirmationRequired without tokens', async () => {
      const result = await handler(makeEvent())
      expect(result).toEqual({ confirmationRequired: true })
    })

    // Safety invariant: findOrLinkUser auto-links accounts by email and must
    // only run for verified addresses (see the SAFETY note in
    // server/utils/auth.ts). No User/Identity row and no tokens may exist
    // until Supabase confirms the email.
    test('does not create a user row or mint tokens before confirmation', async () => {
      await handler(makeEvent())
      expect(mockFindOrLinkUser).not.toHaveBeenCalled()
      expect(mockIssueTokenPair).not.toHaveBeenCalled()
    })
  })

  describe('happy path (no confirmation required)', () => {
    beforeEach(() => {
      mockReadBody.mockResolvedValueOnce({ email: 'test@example.com', password: 'testpass123', name: 'Test User' })
      mockSupabaseSignUp.mockResolvedValueOnce({
        data: {
          user: { id: 'supabase-uid-001', identities: [{ id: '1' }] },
          session: { access_token: 'token' },
        },
        error: null,
      })
      mockFindOrLinkUser.mockResolvedValueOnce(mockDbUser)
    })

    test('calls findOrLinkUser with the email provider profile', async () => {
      await handler(makeEvent())
      expect(mockFindOrLinkUser).toHaveBeenCalledWith({
        provider: 'email',
        providerId: 'supabase-uid-001',
        email: 'test@example.com',
        name: 'Test User',
      })
    })

    test('returns confirmationRequired false with the token pair', async () => {
      const result = await handler(makeEvent())
      expect(result).toEqual({
        confirmationRequired: false,
        accessToken: 'access-token-xyz',
        refreshToken: 'refresh-raw-xyz',
      })
    })

    test('issues the token pair for the resolved user', async () => {
      const event = makeEvent()
      await handler(event)
      expect(mockIssueTokenPair).toHaveBeenCalledWith(event, 'cluser001')
    })
  })

  // Mirrors the web signup regression: `?? undefined` so the helper's
  // existing-identity refresh skips the field when no name is supplied.
  describe('signup without name preserves existing name', () => {
    test('passes name=undefined to findOrLinkUser when name is omitted', async () => {
      mockReadBody.mockResolvedValueOnce({ email: 'test@example.com', password: 'testpass123' })
      mockSupabaseSignUp.mockResolvedValueOnce({
        data: {
          user: { id: 'supabase-uid-001', identities: [{ id: '1' }] },
          session: { access_token: 'token' },
        },
        error: null,
      })
      mockFindOrLinkUser.mockResolvedValueOnce(mockDbUser)

      await handler(makeEvent())

      const arg = mockFindOrLinkUser.mock.calls[0]?.[0] as { name?: string | null }
      expect(arg.name).toBeUndefined()
    })
  })

  describe('error handling', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockReadBody.mockResolvedValueOnce({ email: 'test@example.com', password: 'testpass123' })
      mockSupabaseSignUp.mockResolvedValueOnce({
        data: {
          user: { id: 'supabase-uid-001', identities: [{ id: '1' }] },
          session: { access_token: 'token' },
        },
        error: null,
      })
    })

    afterEach(() => {
      consoleSpy.mockRestore()
    })

    test('throws 500 when findOrLinkUser fails', async () => {
      mockFindOrLinkUser.mockRejectedValueOnce(new Error('DB error'))
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Account setup failed. Please try again.' })
      expect(logger.error).toHaveBeenCalledWith({ err: expect.any(Error), route: 'POST /api/auth/native/email/signup' }, '[POST /api/auth/native/email/signup] Failed')
    })

    test('re-throws H3 errors without wrapping', async () => {
      mockFindOrLinkUser.mockRejectedValueOnce(
        createError({ statusCode: 409, statusMessage: 'Identity already linked to another account.' }),
      )
      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 409 })
      expect(logger.error).not.toHaveBeenCalled()
    })
  })
})
