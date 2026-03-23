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
