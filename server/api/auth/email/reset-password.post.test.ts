import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './reset-password.post'

const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockSupabaseResetPassword = (supabase as typeof supabase).auth.resetPasswordForEmail as ReturnType<typeof vi.fn>
const mockGetRequestURL = getRequestURL as ReturnType<typeof vi.fn>

function makeEvent() {
  return { path: '/api/auth/email/reset-password', context: {} } as any
}

describe('POST /api/auth/email/reset-password', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/auth/email/reset-password'))
    mockSupabaseResetPassword.mockResolvedValue({ data: {}, error: null })
  })

  // Registration is open, so this endpoint is internet-facing and sends a
  // Supabase email for any address a caller supplies.
  describe('rate limiting', () => {
    test('rate limits by IP before reading the body', async () => {
      const mockRateLimit = rateLimitByIp as ReturnType<typeof vi.fn>
      mockRateLimit.mockRejectedValueOnce(createError({ statusCode: 429, statusMessage: 'Too many requests' }))

      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 429 })

      expect(mockReadBody).not.toHaveBeenCalled()
      expect(mockSupabaseResetPassword).not.toHaveBeenCalled()
    })
  })

  test('throws 400 when email is missing', async () => {
    mockReadBody.mockResolvedValueOnce({})

    await expect(handler(makeEvent())).rejects.toThrow('Email is required.')
  })

  test('calls Supabase resetPasswordForEmail with correct redirect', async () => {
    mockReadBody.mockResolvedValueOnce({ email: 'test@example.com' })

    await handler(makeEvent())

    expect(mockSupabaseResetPassword).toHaveBeenCalledWith(
      'test@example.com',
      { redirectTo: 'http://localhost:3000/auth/reset-password' },
    )
  })

  test('always returns success to avoid leaking email existence', async () => {
    mockReadBody.mockResolvedValueOnce({ email: 'nonexistent@example.com' })

    const result = await handler(makeEvent())
    expect(result).toEqual({ success: true })
  })

  test('returns success even when Supabase errors', async () => {
    mockReadBody.mockResolvedValueOnce({ email: 'test@example.com' })
    mockSupabaseResetPassword.mockResolvedValueOnce({
      data: null,
      error: { message: 'Some error' },
    })

    const result = await handler(makeEvent())
    expect(result).toEqual({ success: true })
  })
})
