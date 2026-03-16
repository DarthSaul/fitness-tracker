/**
 * Tests for server/api/auth/apple.ts
 *
 * Coverage strategy:
 *  - OAuth config: correct scopes
 *  - onSuccess: email from payload (authoritative) vs user fallback vs missing email
 *  - onSuccess: name composition — both names, first-only, none (subsequent logins)
 *  - onSuccess: name NOT overwritten in update when absent
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
const mockPrismaUserUpsert = (prisma as typeof prisma).user.upsert as ReturnType<typeof vi.fn>
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
  provider: 'apple',
  providerId: 'apple-sub-001',
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
      mockPrismaUserUpsert.mockResolvedValueOnce(mockDbUser)

      await config.onSuccess(makeEvent(), {
        user: mockUserWithName,
        payload: mockPayload,
      })

      expect(mockPrismaUserUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ email: 'apple@example.com' }),
          update: expect.objectContaining({ email: 'apple@example.com' }),
        }),
      )
    })

    test('falls back to user.email when payload has no email', async () => {
      mockPrismaUserUpsert.mockResolvedValueOnce({
        ...mockDbUser,
        email: 'fallback@example.com',
      })

      await config.onSuccess(makeEvent(), {
        user: { email: 'fallback@example.com' },
        payload: { sub: 'apple-sub-002' },
      })

      expect(mockPrismaUserUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ email: 'fallback@example.com' }),
        }),
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

    test('does not call prisma or setUserSession when email is missing', async () => {
      await config.onSuccess(makeEvent(), {
        user: {},
        payload: { sub: 'apple-sub-003' },
      })

      expect(mockPrismaUserUpsert).not.toHaveBeenCalled()
      expect(mockSetUserSession).not.toHaveBeenCalled()
    })
  })

  describe('onSuccess — name handling', () => {
    test('combines firstName and lastName into a full name string', async () => {
      mockPrismaUserUpsert.mockResolvedValueOnce(mockDbUser)

      await config.onSuccess(makeEvent(), {
        user: { name: { firstName: 'Jane', lastName: 'Appleseed' } },
        payload: mockPayload,
      })

      expect(mockPrismaUserUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ name: 'Jane Appleseed' }),
        }),
      )
    })

    test('uses only firstName when lastName is absent', async () => {
      mockPrismaUserUpsert.mockResolvedValueOnce({ ...mockDbUser, name: 'Jane' })

      await config.onSuccess(makeEvent(), {
        user: { name: { firstName: 'Jane' } },
        payload: mockPayload,
      })

      expect(mockPrismaUserUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ name: 'Jane' }),
        }),
      )
    })

    test('stores null name when Apple provides no name (subsequent logins)', async () => {
      mockPrismaUserUpsert.mockResolvedValueOnce({ ...mockDbUser, name: null })

      await config.onSuccess(makeEvent(), {
        user: {},
        payload: mockPayload,
      })

      expect(mockPrismaUserUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ name: null }),
        }),
      )
    })

    test('does NOT include name in the update payload on subsequent logins (no name from Apple)', async () => {
      // Apple only sends the name on the very first login.
      // When name is absent we must not overwrite what's in the DB.
      mockPrismaUserUpsert.mockResolvedValueOnce({ ...mockDbUser, name: 'Jane Appleseed' })

      await config.onSuccess(makeEvent(), {
        user: {},
        payload: mockPayload,
      })

      const upsertArg = mockPrismaUserUpsert.mock.calls[0]?.[0] as {
        update: Record<string, unknown>
      }
      expect(upsertArg.update).not.toHaveProperty('name')
    })

    test('includes name in the update payload on first login when name is present', async () => {
      mockPrismaUserUpsert.mockResolvedValueOnce(mockDbUser)

      await config.onSuccess(makeEvent(), {
        user: { name: { firstName: 'Jane', lastName: 'Appleseed' } },
        payload: mockPayload,
      })

      const upsertArg = mockPrismaUserUpsert.mock.calls[0]?.[0] as {
        update: Record<string, unknown>
      }
      expect(upsertArg.update).toHaveProperty('name', 'Jane Appleseed')
    })
  })

  describe('onSuccess — upsert where clause', () => {
    test('upserts on the composite apple provider + providerId key', async () => {
      mockPrismaUserUpsert.mockResolvedValueOnce(mockDbUser)

      await config.onSuccess(makeEvent(), {
        user: mockUserWithName,
        payload: mockPayload,
      })

      expect(mockPrismaUserUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            provider_providerId: {
              provider: 'apple',
              providerId: 'apple-sub-001',
            },
          },
        }),
      )
    })

    test('creates user with avatarUrl: null (Apple has no avatar)', async () => {
      mockPrismaUserUpsert.mockResolvedValueOnce(mockDbUser)

      await config.onSuccess(makeEvent(), {
        user: mockUserWithName,
        payload: mockPayload,
      })

      expect(mockPrismaUserUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ avatarUrl: null }),
        }),
      )
    })
  })

  describe('onSuccess — session and redirect', () => {
    test('sets user session with the returned db user fields', async () => {
      mockPrismaUserUpsert.mockResolvedValueOnce(mockDbUser)
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

    test('redirects to /app after successful login', async () => {
      mockPrismaUserUpsert.mockResolvedValueOnce(mockDbUser)
      const event = makeEvent()

      await config.onSuccess(event, {
        user: mockUserWithName,
        payload: mockPayload,
      })

      expect(mockSendRedirect).toHaveBeenCalledWith(event, '/app')
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
