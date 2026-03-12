/**
 * Tests for server/api/auth/google.get.ts
 *
 * Coverage strategy:
 *  - OAuth config: correct scopes requested
 *  - onSuccess happy path: upsert shape, session fields, redirect target
 *  - onSuccess with null profile fields (no name, no picture)
 *  - onError: redirect destination and console.error call
 *
 * The global stub defineOAuthGoogleEventHandler(config) returns config
 * unchanged (see vitest.setup.ts), so importing the handler module gives us
 * the config object directly, letting us call onSuccess/onError in tests.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { User } from '@prisma/client'

// ── Import the handler — returns the config object due to the global stub ─────
import handlerConfig from './google.get'

type GoogleOAuthConfig = {
  config: { scope: string[] }
  onSuccess: (event: unknown, payload: { user: GoogleUser }) => Promise<unknown>
  onError: (event: unknown, error: Error) => unknown
}

type GoogleUser = {
  sub: string
  email: string
  name?: string
  picture?: string
}

const config = handlerConfig as unknown as GoogleOAuthConfig

// ── Stubbed globals ───────────────────────────────────────────────────────────
const mockPrismaUserUpsert = (prisma as typeof prisma).user.upsert as ReturnType<typeof vi.fn>
const mockSetUserSession = setUserSession as ReturnType<typeof vi.fn>
const mockSendRedirect = sendRedirect as ReturnType<typeof vi.fn>

// ── Mock data ─────────────────────────────────────────────────────────────────
const mockGoogleUser: GoogleUser = {
  sub: 'google-sub-001',
  email: 'test@example.com',
  name: 'Test User',
  picture: 'https://example.com/avatar.jpg',
}

const mockDbUser = {
  id: 'cluser001',
  email: 'test@example.com',
  name: 'Test User',
  avatarUrl: 'https://example.com/avatar.jpg',
  provider: 'google',
  providerId: 'google-sub-001',
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies User

function makeEvent() {
  return { path: '/api/auth/google', context: {} }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('GET /api/auth/google', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSetUserSession.mockResolvedValue(undefined)
    mockSendRedirect.mockResolvedValue(undefined)
  })

  describe('OAuth config', () => {
    test('requests email and profile scopes', () => {
      expect(config.config.scope).toEqual(['email', 'profile'])
    })
  })

  describe('onSuccess — happy path', () => {
    test('upserts user with google provider and correct fields', async () => {
      mockPrismaUserUpsert.mockResolvedValueOnce(mockDbUser)

      await config.onSuccess(makeEvent(), { user: mockGoogleUser })

      expect(mockPrismaUserUpsert).toHaveBeenCalledOnce()
      expect(mockPrismaUserUpsert).toHaveBeenCalledWith({
        where: {
          provider_providerId: {
            provider: 'google',
            providerId: 'google-sub-001',
          },
        },
        update: {
          name: 'Test User',
          avatarUrl: 'https://example.com/avatar.jpg',
          email: 'test@example.com',
        },
        create: {
          email: 'test@example.com',
          name: 'Test User',
          avatarUrl: 'https://example.com/avatar.jpg',
          provider: 'google',
          providerId: 'google-sub-001',
        },
      })
    })

    test('sets user session with db user fields', async () => {
      mockPrismaUserUpsert.mockResolvedValueOnce(mockDbUser)
      const event = makeEvent()

      await config.onSuccess(event, { user: mockGoogleUser })

      expect(mockSetUserSession).toHaveBeenCalledOnce()
      expect(mockSetUserSession).toHaveBeenCalledWith(event, {
        user: {
          id: 'cluser001',
          email: 'test@example.com',
          name: 'Test User',
          avatarUrl: 'https://example.com/avatar.jpg',
        },
      })
    })

    test('redirects to / after successful login', async () => {
      mockPrismaUserUpsert.mockResolvedValueOnce(mockDbUser)
      const event = makeEvent()

      await config.onSuccess(event, { user: mockGoogleUser })

      expect(mockSendRedirect).toHaveBeenCalledOnce()
      expect(mockSendRedirect).toHaveBeenCalledWith(event, '/')
    })
  })

  describe('onSuccess — null/undefined profile fields', () => {
    test('stores null name when Google user has no name', async () => {
      const userWithoutName: GoogleUser = { ...mockGoogleUser, name: undefined }
      mockPrismaUserUpsert.mockResolvedValueOnce({ ...mockDbUser, name: null })

      await config.onSuccess(makeEvent(), { user: userWithoutName })

      expect(mockPrismaUserUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ name: null }),
          create: expect.objectContaining({ name: null }),
        }),
      )
    })

    test('stores null avatarUrl when Google user has no picture', async () => {
      const userWithoutPicture: GoogleUser = { ...mockGoogleUser, picture: undefined }
      mockPrismaUserUpsert.mockResolvedValueOnce({ ...mockDbUser, avatarUrl: null })

      await config.onSuccess(makeEvent(), { user: userWithoutPicture })

      expect(mockPrismaUserUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ avatarUrl: null }),
          create: expect.objectContaining({ avatarUrl: null }),
        }),
      )
    })
  })

  describe('onError', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleSpy.mockRestore()
    })

    test('redirects to /login?error=google_failed', () => {
      const event = makeEvent()
      config.onError(event, new Error('oauth failure'))
      expect(mockSendRedirect).toHaveBeenCalledWith(event, '/login?error=google_failed')
    })

    test('logs the error via console.error', () => {
      const event = makeEvent()
      const err = new Error('token exchange failed')

      config.onError(event, err)

      expect(consoleSpy).toHaveBeenCalledWith('Google OAuth error:', err)
    })
  })
})
