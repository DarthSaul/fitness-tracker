/**
 * Tests for app/composables/useAuth.ts
 *
 * Coverage strategy:
 *  - Return shape: all six values are exposed
 *  - signInWithGoogle: navigates externally to /api/auth/google
 *  - signInWithApple: navigates externally to /api/auth/apple
 *  - signOut: POSTs to logout, refreshes session, navigates to /login — in that order
 *  - signOut error propagation
 *
 * Nuxt globals (useUserSession, navigateTo, $fetch) are stubbed globally in
 * vitest.setup.ts. We configure them per-test via the cast references below.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { useAuth } from './useAuth'

// ── Stub references ───────────────────────────────────────────────────────────
const mockNavigateTo = navigateTo as ReturnType<typeof vi.fn>
const mockDollarFetch = $fetch as ReturnType<typeof vi.fn>
const mockFetchSession = vi.fn()

// Configure what useUserSession() returns for all tests in this file.
// We reset this in beforeEach.
;(useUserSession as ReturnType<typeof vi.fn>).mockReturnValue({
  loggedIn: { value: true },
  user: { value: { id: 'u1', email: 'a@b.com', name: 'Alice', avatarUrl: null } },
  session: { value: { user: { id: 'u1' } } },
  fetch: mockFetchSession,
})

describe('useAuth composable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigateTo.mockResolvedValue(undefined)
    mockDollarFetch.mockResolvedValue(undefined)
    mockFetchSession.mockResolvedValue(undefined)
    // Re-apply the useUserSession return value after clearAllMocks resets it
    ;(useUserSession as ReturnType<typeof vi.fn>).mockReturnValue({
      loggedIn: { value: true },
      user: { value: { id: 'u1', email: 'a@b.com', name: 'Alice', avatarUrl: null } },
      session: { value: { user: { id: 'u1' } } },
      fetch: mockFetchSession,
    })
  })

  describe('return shape', () => {
    test('exposes loggedIn from useUserSession', () => {
      const { loggedIn } = useAuth()
      expect(loggedIn).toEqual({ value: true })
    })

    test('exposes user from useUserSession', () => {
      const { user } = useAuth()
      expect(user).toEqual({
        value: { id: 'u1', email: 'a@b.com', name: 'Alice', avatarUrl: null },
      })
    })

    test('exposes session from useUserSession', () => {
      const { session } = useAuth()
      expect(session).toEqual({ value: { user: { id: 'u1' } } })
    })

    test('exposes fetch from useUserSession', () => {
      const { fetch } = useAuth()
      expect(fetch).toBe(mockFetchSession)
    })

    test('exposes signInWithGoogle as a function', () => {
      const { signInWithGoogle } = useAuth()
      expect(typeof signInWithGoogle).toBe('function')
    })

    test('exposes signInWithApple as a function', () => {
      const { signInWithApple } = useAuth()
      expect(typeof signInWithApple).toBe('function')
    })

    test('exposes signOut as a function', () => {
      const { signOut } = useAuth()
      expect(typeof signOut).toBe('function')
    })
  })

  describe('signInWithGoogle', () => {
    test('navigates to /api/auth/google', async () => {
      const { signInWithGoogle } = useAuth()
      await signInWithGoogle()
      expect(mockNavigateTo).toHaveBeenCalledWith('/api/auth/google', { external: true })
    })

    test('passes external: true so Nuxt treats it as a full browser redirect', async () => {
      const { signInWithGoogle } = useAuth()
      await signInWithGoogle()
      expect(mockNavigateTo).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ external: true }),
      )
    })
  })

  describe('signInWithApple', () => {
    test('navigates to /api/auth/apple', async () => {
      const { signInWithApple } = useAuth()
      await signInWithApple()
      expect(mockNavigateTo).toHaveBeenCalledWith('/api/auth/apple', { external: true })
    })

    test('passes external: true so Nuxt treats it as a full browser redirect', async () => {
      const { signInWithApple } = useAuth()
      await signInWithApple()
      expect(mockNavigateTo).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ external: true }),
      )
    })
  })

  describe('signOut', () => {
    test('POSTs to /api/auth/logout', async () => {
      const { signOut } = useAuth()
      await signOut()
      expect(mockDollarFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    })

    test('refreshes local session state after the server logout', async () => {
      const { signOut } = useAuth()
      await signOut()
      expect(mockFetchSession).toHaveBeenCalledOnce()
    })

    test('navigates to /login after refreshing session state', async () => {
      const { signOut } = useAuth()
      await signOut()
      expect(mockNavigateTo).toHaveBeenCalledWith('/login')
    })

    test('executes $fetch → fetchSession → navigateTo in that order', async () => {
      const callOrder: string[] = []
      mockDollarFetch.mockImplementation(() => {
        callOrder.push('$fetch')
        return Promise.resolve()
      })
      mockFetchSession.mockImplementation(() => {
        callOrder.push('fetchSession')
        return Promise.resolve()
      })
      mockNavigateTo.mockImplementation(() => {
        callOrder.push('navigateTo')
        return Promise.resolve()
      })

      const { signOut } = useAuth()
      await signOut()

      expect(callOrder).toEqual(['$fetch', 'fetchSession', 'navigateTo'])
    })

    test('propagates an error if the logout $fetch call rejects', async () => {
      mockDollarFetch.mockRejectedValueOnce(new Error('network error'))
      const { signOut } = useAuth()
      await expect(signOut()).rejects.toThrow('network error')
    })
  })
})
