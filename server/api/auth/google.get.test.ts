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
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
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
const mockFindOrLinkUser = findOrLinkUser as ReturnType<typeof vi.fn>
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
    test('calls findOrLinkUser with the google provider profile', async () => {
      mockFindOrLinkUser.mockResolvedValueOnce(mockDbUser)

      await config.onSuccess(makeEvent(), { user: mockGoogleUser })

      expect(mockFindOrLinkUser).toHaveBeenCalledOnce()
      expect(mockFindOrLinkUser).toHaveBeenCalledWith({
        provider: 'google',
        providerId: 'google-sub-001',
        email: 'test@example.com',
        name: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
      })
    })

    test('sets user session with db user fields', async () => {
      mockFindOrLinkUser.mockResolvedValueOnce(mockDbUser)
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
      mockFindOrLinkUser.mockResolvedValueOnce(mockDbUser)
      const event = makeEvent()

      await config.onSuccess(event, { user: mockGoogleUser })

      expect(mockSendRedirect).toHaveBeenCalledOnce()
      expect(mockSendRedirect).toHaveBeenCalledWith(event, '/')
    })
  })

  describe('onSuccess — omitted profile fields', () => {
    // We pass `?? undefined` so the helper preserves whatever's already on
    // the User row (existing identity refresh path) instead of clearing it.
    test('passes name=undefined to findOrLinkUser when Google user has no name', async () => {
      const userWithoutName: GoogleUser = { ...mockGoogleUser, name: undefined }
      mockFindOrLinkUser.mockResolvedValueOnce({ ...mockDbUser, name: null })

      await config.onSuccess(makeEvent(), { user: userWithoutName })

      const arg = mockFindOrLinkUser.mock.calls[0]?.[0] as { name?: string | null }
      expect(arg.name).toBeUndefined()
    })

    test('passes avatarUrl=undefined to findOrLinkUser when Google user has no picture', async () => {
      const userWithoutPicture: GoogleUser = { ...mockGoogleUser, picture: undefined }
      mockFindOrLinkUser.mockResolvedValueOnce({ ...mockDbUser, avatarUrl: null })

      await config.onSuccess(makeEvent(), { user: userWithoutPicture })

      const arg = mockFindOrLinkUser.mock.calls[0]?.[0] as { avatarUrl?: string | null }
      expect(arg.avatarUrl).toBeUndefined()
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

      expect(logger.error).toHaveBeenCalledWith({ err: err }, 'Google OAuth error:')
    })
  })
})
