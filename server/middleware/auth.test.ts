/**
 * Tests for server/middleware/auth.ts
 *
 * Coverage strategy:
 *  - Public path passthrough: all three prefix patterns plus a sub-path
 *  - Authenticated requests: session with user attaches userId to context
 *  - Unauthenticated requests: null session, missing user, explicit null user
 *  - Verify createError args and that userId is never set on failure
 *  - Protected path matching: non-public paths do trigger session check
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

// The source file uses Nuxt auto-import globals (defineEventHandler, getUserSession,
// createError). vitest.setup.ts stubs those globals before any module is imported.
import handler from './auth'

// Grab the stubbed globals so we can configure and assert on them per-test.
const mockGetUserSession = getUserSession as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(path: string): { path: string; context: Record<string, unknown> } {
  return { path, context: {} }
}

describe('server/middleware/auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Restore createError to its default error-factory behaviour after clearAllMocks
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & {
        statusCode: number
        statusMessage: string
      }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  describe('public path passthrough', () => {
    test('allows /api/auth/ prefix without checking session', async () => {
      const event = makeEvent('/api/auth/google')
      await (handler as (e: typeof event) => Promise<void>)(event)
      expect(mockGetUserSession).not.toHaveBeenCalled()
    })

    test('allows /api/_auth/ prefix without checking session', async () => {
      const event = makeEvent('/api/_auth/session')
      await (handler as (e: typeof event) => Promise<void>)(event)
      expect(mockGetUserSession).not.toHaveBeenCalled()
    })

    test('allows /api/health without checking session', async () => {
      const event = makeEvent('/api/health')
      await (handler as (e: typeof event) => Promise<void>)(event)
      expect(mockGetUserSession).not.toHaveBeenCalled()
    })

    test('allows /api/auth/logout (sub-path of /api/auth/) without checking session', async () => {
      const event = makeEvent('/api/auth/logout')
      await (handler as (e: typeof event) => Promise<void>)(event)
      expect(mockGetUserSession).not.toHaveBeenCalled()
    })
  })

  describe('authenticated requests', () => {
    test('attaches userId to event.context when session contains a user', async () => {
      mockGetUserSession.mockResolvedValueOnce({ user: { id: 'user-abc-123' } })
      const event = makeEvent('/api/workouts')
      await (handler as (e: typeof event) => Promise<void>)(event)
      expect(event.context.userId).toBe('user-abc-123')
    })

    test('resolves without throwing when session is valid', async () => {
      mockGetUserSession.mockResolvedValueOnce({ user: { id: 'user-xyz' } })
      const event = makeEvent('/api/user-programs')
      await expect(
        (handler as (e: typeof event) => Promise<void>)(event),
      ).resolves.not.toThrow()
    })

    test('calls getUserSession with the event', async () => {
      mockGetUserSession.mockResolvedValueOnce({ user: { id: 'u1' } })
      const event = makeEvent('/api/programs')
      await (handler as (e: typeof event) => Promise<void>)(event)
      expect(mockGetUserSession).toHaveBeenCalledWith(event)
    })
  })

  describe('unauthenticated requests', () => {
    test('throws 401 when session has no user object', async () => {
      mockGetUserSession.mockResolvedValueOnce({})
      const event = makeEvent('/api/workouts')
      await expect(
        (handler as (e: typeof event) => Promise<void>)(event),
      ).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Unauthorized' })
    })

    test('throws 401 when getUserSession returns null', async () => {
      mockGetUserSession.mockResolvedValueOnce(null)
      const event = makeEvent('/api/programs')
      await expect(
        (handler as (e: typeof event) => Promise<void>)(event),
      ).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Unauthorized' })
    })

    test('throws 401 when user property is explicitly null', async () => {
      mockGetUserSession.mockResolvedValueOnce({ user: null })
      const event = makeEvent('/api/programs')
      await expect(
        (handler as (e: typeof event) => Promise<void>)(event),
      ).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Unauthorized' })
    })

    test('calls createError with statusCode 401 and message Unauthorized', async () => {
      mockGetUserSession.mockResolvedValueOnce({ user: null })
      const event = makeEvent('/api/workouts')
      try {
        await (handler as (e: typeof event) => Promise<void>)(event)
      } catch {
        // expected
      }
      expect(mockCreateError).toHaveBeenCalledWith({
        statusCode: 401,
        statusMessage: 'Unauthorized',
      })
    })

    test('does not attach userId when request is unauthenticated', async () => {
      mockGetUserSession.mockResolvedValueOnce({ user: null })
      const event = makeEvent('/api/workouts')
      try {
        await (handler as (e: typeof event) => Promise<void>)(event)
      } catch {
        // expected
      }
      expect(event.context.userId).toBeUndefined()
    })
  })

  describe('protected path matching', () => {
    test('does check session for /api/programs', async () => {
      mockGetUserSession.mockResolvedValueOnce({ user: { id: 'u1' } })
      const event = makeEvent('/api/programs')
      await (handler as (e: typeof event) => Promise<void>)(event)
      expect(mockGetUserSession).toHaveBeenCalled()
    })

    test('does check session for /api/workouts/sessions', async () => {
      mockGetUserSession.mockResolvedValueOnce({ user: { id: 'u1' } })
      const event = makeEvent('/api/workouts/sessions')
      await (handler as (e: typeof event) => Promise<void>)(event)
      expect(mockGetUserSession).toHaveBeenCalled()
    })
  })
})
