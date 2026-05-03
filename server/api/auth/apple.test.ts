/**
 * Tests for server/api/auth/apple.ts
 *
 * Coverage strategy:
 *  - OAuth config: correct scopes
 *  - onSuccess: email from payload (authoritative) vs user fallback vs missing email
 *  - onSuccess: name composition — both names, first-only, none (subsequent logins)
 *  - onSuccess: name NOT overwritten in update when absent (delegated to findOrLinkUser)
 *  - onSuccess: session fields and redirect target
 *  - onError: redirect destination and console.error call
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { User } from '@prisma/client'

import handlerConfig from './apple'

// ── Types ─────────────────────────────────────────────────────────────────────
type AppleUserName = { firstName?: string; lastName?: string }
type AppleUser = { email?: string; name?: AppleUserName }
type ApplePayload = { sub: string; email?: string }
type OAuthAppleConfig = {
  config: { scope: string[] }
  onSuccess: (
    event: unknown,
    payload: { user: AppleUser; payload: ApplePayload },
  ) => Promise<unknown>
  onError: (event: unknown, error: Error) => unknown
}

const config = handlerConfig as unknown as OAuthAppleConfig

// ── Stubbed globals ───────────────────────────────────────────────────────────
const mockFindOrLinkUser = findOrLinkUser as ReturnType<typeof vi.fn>
const mockSetUserSession = setUserSession as ReturnType<typeof vi.fn>
const mockSendRedirect = sendRedirect as ReturnType<typeof vi.fn>

// ── Mock data ─────────────────────────────────────────────────────────────────
const mockPayload: ApplePayload = {
  sub: 'apple-sub-001',
  email: 'apple@example.com',
}

const mockUserWithName: AppleUser = {
  name: { firstName: 'Jane', lastName: 'Appleseed' },
}

const mockDbUser = {
  id: 'clapple001',
  email: 'apple@example.com',
  name: 'Jane Appleseed',
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies User

function makeEvent() {
  return { path: '/api/auth/apple', context: {} }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('Apple OAuth handler (/api/auth/apple)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSetUserSession.mockResolvedValue(undefined)
    mockSendRedirect.mockResolvedValue(undefined)
  })

  describe('OAuth config', () => {
    test('requests name and email scopes', () => {
      expect(config.config.scope).toEqual(['name', 'email'])
    })
  })

  describe('onSuccess — email resolution', () => {
    test('uses payload.email as the authoritative email source', async () => {
      mockFindOrLinkUser.mockResolvedValueOnce(mockDbUser)

      await config.onSuccess(makeEvent(), {
        user: mockUserWithName,
        payload: mockPayload,
      })

      expect(mockFindOrLinkUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'apple@example.com' }),
      )
    })

    test('falls back to user.email when payload has no email', async () => {
      mockFindOrLinkUser.mockResolvedValueOnce({
        ...mockDbUser,
        email: 'fallback@example.com',
      })

      await config.onSuccess(makeEvent(), {
        user: { email: 'fallback@example.com' },
        payload: { sub: 'apple-sub-002' },
      })

      expect(mockFindOrLinkUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'fallback@example.com' }),
      )
    })

    test('redirects to /login?error=apple_no_email when no email exists in payload or user', async () => {
      const event = makeEvent()

      await config.onSuccess(event, {
        user: {},
        payload: { sub: 'apple-sub-003' },
      })

      expect(mockSendRedirect).toHaveBeenCalledWith(event, '/login?error=apple_no_email')
    })

    test('does not call findOrLinkUser or setUserSession when email is missing', async () => {
      await config.onSuccess(makeEvent(), {
        user: {},
        payload: { sub: 'apple-sub-003' },
      })

      expect(mockFindOrLinkUser).not.toHaveBeenCalled()
      expect(mockSetUserSession).not.toHaveBeenCalled()
    })
  })

  describe('onSuccess — name handling', () => {
    test('combines firstName and lastName into a full name string', async () => {
      mockFindOrLinkUser.mockResolvedValueOnce(mockDbUser)

      await config.onSuccess(makeEvent(), {
        user: { name: { firstName: 'Jane', lastName: 'Appleseed' } },
        payload: mockPayload,
      })

      expect(mockFindOrLinkUser).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Jane Appleseed' }),
      )
    })

    test('uses only firstName when lastName is absent', async () => {
      mockFindOrLinkUser.mockResolvedValueOnce({ ...mockDbUser, name: 'Jane' })

      await config.onSuccess(makeEvent(), {
        user: { name: { firstName: 'Jane' } },
        payload: mockPayload,
      })

      expect(mockFindOrLinkUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'Jane' }))
    })

    // Apple only sends the name on the very first login. The route maps an
    // absent name to `undefined` so findOrLinkUser skips updating it on
    // subsequent logins, preserving whatever's already on the User row.
    test('passes name=undefined to findOrLinkUser when Apple provides no name', async () => {
      mockFindOrLinkUser.mockResolvedValueOnce({ ...mockDbUser, name: 'Jane Appleseed' })

      await config.onSuccess(makeEvent(), {
        user: {},
        payload: mockPayload,
      })

      const arg = mockFindOrLinkUser.mock.calls[0]?.[0] as { name?: string | null }
      expect(arg.name).toBeUndefined()
    })
  })

  describe('onSuccess — provider profile', () => {
    test('calls findOrLinkUser with the apple provider and providerId', async () => {
      mockFindOrLinkUser.mockResolvedValueOnce(mockDbUser)

      await config.onSuccess(makeEvent(), {
        user: mockUserWithName,
        payload: mockPayload,
      })

      expect(mockFindOrLinkUser).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'apple',
          providerId: 'apple-sub-001',
        }),
      )
    })
  })

  describe('onSuccess — session and redirect', () => {
    test('sets user session with the returned db user fields', async () => {
      mockFindOrLinkUser.mockResolvedValueOnce(mockDbUser)
      const event = makeEvent()

      await config.onSuccess(event, {
        user: mockUserWithName,
        payload: mockPayload,
      })

      expect(mockSetUserSession).toHaveBeenCalledWith(event, {
        user: {
          id: 'clapple001',
          email: 'apple@example.com',
          name: 'Jane Appleseed',
          avatarUrl: null,
        },
      })
    })

    test('redirects to / after successful login', async () => {
      mockFindOrLinkUser.mockResolvedValueOnce(mockDbUser)
      const event = makeEvent()

      await config.onSuccess(event, {
        user: mockUserWithName,
        payload: mockPayload,
      })

      expect(mockSendRedirect).toHaveBeenCalledWith(event, '/')
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

    test('redirects to /login?error=apple_failed', () => {
      const event = makeEvent()
      config.onError(event, new Error('apple error'))
      expect(mockSendRedirect).toHaveBeenCalledWith(event, '/login?error=apple_failed')
    })

    test('logs the error via console.error', () => {
      const event = makeEvent()
      const err = new Error('id token invalid')

      config.onError(event, err)

      expect(consoleSpy).toHaveBeenCalledWith('Apple OAuth error:', err)
    })
  })
})
