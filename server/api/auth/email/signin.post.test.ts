import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { User } from '@prisma/client'

import handler from './signin.post'

const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockPrismaUserUpsert = (prisma as typeof prisma).user.upsert as ReturnType<typeof vi.fn>
const mockSetUserSession = setUserSession as ReturnType<typeof vi.fn>
const mockSupabaseSignIn = (supabase as typeof supabase).auth.signInWithPassword as ReturnType<typeof vi.fn>

const mockDbUser = {
  id: 'cluser001',
  email: 'test@example.com',
  name: null,
  avatarUrl: null,
  provider: 'email',
  providerId: 'supabase-uid-001',
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies User

function makeEvent() {
  return { path: '/api/auth/email/signin', context: {} } as any
}

describe('POST /api/auth/email/signin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSetUserSession.mockResolvedValue(undefined)
  })

  test('throws 400 when email is missing', async () => {
    mockReadBody.mockResolvedValueOnce({ password: 'testpass123' })

    await expect(handler(makeEvent())).rejects.toThrow('Email and password are required.')
  })

  test('throws 400 when password is missing', async () => {
    mockReadBody.mockResolvedValueOnce({ email: 'test@example.com' })

    await expect(handler(makeEvent())).rejects.toThrow('Email and password are required.')
  })

  test('throws 401 when Supabase returns invalid credentials', async () => {
    mockReadBody.mockResolvedValueOnce({ email: 'test@example.com', password: 'wrong' })
    mockSupabaseSignIn.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid login credentials' },
    })

    await expect(handler(makeEvent())).rejects.toThrow('Invalid email or password.')
  })

  describe('happy path', () => {
    beforeEach(() => {
      mockReadBody.mockResolvedValueOnce({ email: 'test@example.com', password: 'testpass123' })
      mockSupabaseSignIn.mockResolvedValueOnce({
        data: {
          user: { id: 'supabase-uid-001', email: 'test@example.com' },
          session: { access_token: 'token' },
        },
        error: null,
      })
      mockPrismaUserUpsert.mockResolvedValueOnce(mockDbUser)
    })

    test('upserts user with email provider', async () => {
      await handler(makeEvent())

      expect(mockPrismaUserUpsert).toHaveBeenCalledWith({
        where: {
          provider_providerId: {
            provider: 'email',
            providerId: 'supabase-uid-001',
          },
        },
        update: {
          email: 'test@example.com',
        },
        create: {
          email: 'test@example.com',
          name: null,
          avatarUrl: null,
          provider: 'email',
          providerId: 'supabase-uid-001',
        },
      })
    })

    test('sets user session', async () => {
      const event = makeEvent()
      await handler(event)

      expect(mockSetUserSession).toHaveBeenCalledWith(event, {
        user: {
          id: 'cluser001',
          email: 'test@example.com',
          name: null,
          avatarUrl: null,
        },
      })
    })

    test('returns success true', async () => {
      const result = await handler(makeEvent())
      expect(result).toEqual({ success: true })
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

    test('throws 500 when prisma upsert fails', async () => {
      mockReadBody.mockResolvedValueOnce({ email: 'test@example.com', password: 'testpass123' })
      mockSupabaseSignIn.mockResolvedValueOnce({
        data: {
          user: { id: 'supabase-uid-001', email: 'test@example.com' },
          session: { access_token: 'token' },
        },
        error: null,
      })
      mockPrismaUserUpsert.mockRejectedValueOnce(new Error('DB error'))

      await expect(handler(makeEvent())).rejects.toThrow('Sign-in failed. Please try again.')
    })
  })
})
