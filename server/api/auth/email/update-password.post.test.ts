import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './update-password.post'

const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockSupabaseSetSession = (supabase as typeof supabase).auth.setSession as ReturnType<typeof vi.fn>
const mockSupabaseUpdateUser = (supabase as typeof supabase).auth.updateUser as ReturnType<typeof vi.fn>

function makeEvent() {
  return { path: '/api/auth/email/update-password', context: {} } as any
}

describe('POST /api/auth/email/update-password', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('throws 400 when accessToken is missing', async () => {
    mockReadBody.mockResolvedValueOnce({ refreshToken: 'rt', newPassword: 'newpass123' })

    await expect(handler(makeEvent())).rejects.toThrow('Access token, refresh token, and new password are required.')
  })

  test('throws 400 when refreshToken is missing', async () => {
    mockReadBody.mockResolvedValueOnce({ accessToken: 'at', newPassword: 'newpass123' })

    await expect(handler(makeEvent())).rejects.toThrow('Access token, refresh token, and new password are required.')
  })

  test('throws 400 when newPassword is missing', async () => {
    mockReadBody.mockResolvedValueOnce({ accessToken: 'at', refreshToken: 'rt' })

    await expect(handler(makeEvent())).rejects.toThrow('Access token, refresh token, and new password are required.')
  })

  test('throws 400 when password is too short', async () => {
    mockReadBody.mockResolvedValueOnce({ accessToken: 'at', refreshToken: 'rt', newPassword: 'short' })

    await expect(handler(makeEvent())).rejects.toThrow('Password must be at least 8 characters.')
  })

  test('throws 400 when session is invalid', async () => {
    mockReadBody.mockResolvedValueOnce({ accessToken: 'at', refreshToken: 'rt', newPassword: 'newpass123' })
    mockSupabaseSetSession.mockResolvedValueOnce({
      data: null,
      error: { message: 'Invalid session' },
    })

    await expect(handler(makeEvent())).rejects.toThrow('Invalid or expired reset link. Please request a new one.')
  })

  test('throws 400 when password update fails', async () => {
    mockReadBody.mockResolvedValueOnce({ accessToken: 'at', refreshToken: 'rt', newPassword: 'newpass123' })
    mockSupabaseSetSession.mockResolvedValueOnce({ data: {}, error: null })
    mockSupabaseUpdateUser.mockResolvedValueOnce({
      data: null,
      error: { message: 'Password too weak' },
    })

    await expect(handler(makeEvent())).rejects.toThrow('Password too weak')
  })

  test('returns success on happy path', async () => {
    mockReadBody.mockResolvedValueOnce({ accessToken: 'at', refreshToken: 'rt', newPassword: 'newpass123' })
    mockSupabaseSetSession.mockResolvedValueOnce({ data: {}, error: null })
    mockSupabaseUpdateUser.mockResolvedValueOnce({ data: {}, error: null })

    const result = await handler(makeEvent())
    expect(result).toEqual({ success: true })
  })

  test('calls setSession with correct tokens', async () => {
    mockReadBody.mockResolvedValueOnce({ accessToken: 'my-at', refreshToken: 'my-rt', newPassword: 'newpass123' })
    mockSupabaseSetSession.mockResolvedValueOnce({ data: {}, error: null })
    mockSupabaseUpdateUser.mockResolvedValueOnce({ data: {}, error: null })

    await handler(makeEvent())

    expect(mockSupabaseSetSession).toHaveBeenCalledWith({
      access_token: 'my-at',
      refresh_token: 'my-rt',
    })
  })

  test('calls updateUser with new password', async () => {
    mockReadBody.mockResolvedValueOnce({ accessToken: 'at', refreshToken: 'rt', newPassword: 'supersecure123' })
    mockSupabaseSetSession.mockResolvedValueOnce({ data: {}, error: null })
    mockSupabaseUpdateUser.mockResolvedValueOnce({ data: {}, error: null })

    await handler(makeEvent())

    expect(mockSupabaseUpdateUser).toHaveBeenCalledWith({ password: 'supersecure123' })
  })
})
