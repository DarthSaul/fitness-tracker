import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './resend-confirmation.post'

const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockSupabaseResend = (supabase as typeof supabase).auth.resend as ReturnType<typeof vi.fn>

function makeEvent() {
  return { path: '/api/auth/native/email/resend-confirmation', context: {} } as any
}

describe('POST /api/auth/native/email/resend-confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseResend.mockResolvedValue({ data: {}, error: null })
  })

  describe('rate limiting', () => {
    test('rate limits by IP before reading the body', async () => {
      const mockRateLimit = rateLimitByIp as ReturnType<typeof vi.fn>
      mockRateLimit.mockRejectedValueOnce(createError({ statusCode: 429, statusMessage: 'Too many requests' }))

      await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 429 })

      expect(mockReadBody).not.toHaveBeenCalled()
      expect(mockSupabaseResend).not.toHaveBeenCalled()
    })
  })

  test('throws 400 when email is missing', async () => {
    mockReadBody.mockResolvedValueOnce({})
    await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Email is required.' })
  })

  test('resends the signup confirmation email', async () => {
    mockReadBody.mockResolvedValueOnce({ email: 'test@example.com' })

    const result = await handler(makeEvent())

    expect(mockSupabaseResend).toHaveBeenCalledWith({ type: 'signup', email: 'test@example.com' })
    expect(result).toEqual({ success: true })
  })

  // Anti-enumeration: Supabase's errors here (unknown address, already
  // confirmed, its per-address resend cooldown) must not reach the caller.
  test('still returns success when Supabase reports an error, logging a warning', async () => {
    mockReadBody.mockResolvedValueOnce({ email: 'test@example.com' })
    mockSupabaseResend.mockResolvedValueOnce({
      data: null,
      error: { message: 'For security purposes, you can only request this once every 60 seconds' },
    })

    const result = await handler(makeEvent())

    expect(result).toEqual({ success: true })
    expect(logger.warn).toHaveBeenCalledWith(
      { err: expect.anything(), route: 'POST /api/auth/native/email/resend-confirmation' },
      '[POST /api/auth/native/email/resend-confirmation] Resend failed',
    )
  })

  test('still returns success when the Supabase call rejects, logging a warning', async () => {
    mockReadBody.mockResolvedValueOnce({ email: 'test@example.com' })
    mockSupabaseResend.mockRejectedValueOnce(new Error('network down'))

    const result = await handler(makeEvent())

    expect(result).toEqual({ success: true })
    expect(logger.warn).toHaveBeenCalledWith(
      { err: expect.any(Error), route: 'POST /api/auth/native/email/resend-confirmation' },
      '[POST /api/auth/native/email/resend-confirmation] Resend failed',
    )
  })
})
