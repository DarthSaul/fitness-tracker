import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { User } from '@prisma/client'

import handler from './signup.post'

const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockFindOrLinkUser = findOrLinkUser as ReturnType<typeof vi.fn>
const mockSetUserSession = setUserSession as ReturnType<typeof vi.fn>
const mockSupabaseSignUp = (supabase as typeof supabase).auth.signUp as ReturnType<typeof vi.fn>

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
  return { path: '/api/auth/email/signup', context: {} } as any
}

describe('POST /api/auth/email/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSetUserSession.mockResolvedValue(undefined)
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

  test('throws 400 when Supabase returns an error', async () => {
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

  test('returns confirmationRequired when no session (email confirmation enabled)', async () => {
    mockReadBody.mockResolvedValueOnce({ email: 'test@example.com', password: 'testpass123' })
    mockSupabaseSignUp.mockResolvedValueOnce({
      data: {
        user: { id: 'supabase-uid-001', identities: [{ id: '1' }] },
        session: null,
      },
      error: null,
    })

    const result = await handler(makeEvent())
    expect(result).toEqual({ confirmationRequired: true })
    expect(mockFindOrLinkUser).not.toHaveBeenCalled()
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

    test('sets user session', async () => {
      const event = makeEvent()
      await handler(event)

      expect(mockSetUserSession).toHaveBeenCalledWith(event, {
        user: {
          id: 'cluser001',
          email: 'test@example.com',
          name: 'Test User',
          avatarUrl: null,
        },
      })
    })

    test('returns confirmationRequired false', async () => {
      const result = await handler(makeEvent())
      expect(result).toEqual({ confirmationRequired: false })
    })
  })

  // Regression: previously the route passed `name: body.name ?? null`, which
  // overwrote an existing User.name with null whenever signup omitted the field.
  // Now passes `?? undefined` so the helper's existing-identity refresh skips
  // the field entirely when no name is supplied.
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

  describe('upsert failure', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleSpy.mockRestore()
    })

    test('throws 500 when findOrLinkUser fails', async () => {
      mockReadBody.mockResolvedValueOnce({ email: 'test@example.com', password: 'testpass123' })
      mockSupabaseSignUp.mockResolvedValueOnce({
        data: {
          user: { id: 'supabase-uid-001', identities: [{ id: '1' }] },
          session: { access_token: 'token' },
        },
        error: null,
      })
      mockFindOrLinkUser.mockRejectedValueOnce(new Error('DB error'))

      await expect(handler(makeEvent())).rejects.toThrow('Account setup failed. Please try again.')
    })
  })
})
