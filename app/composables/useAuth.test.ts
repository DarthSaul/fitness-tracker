/**
 * Tests for app/composables/useAuth.ts
 *
 * Coverage strategy:
 *  - Return shape: all values are exposed
 *  - signInWithGoogle: navigates externally to /api/auth/google
 *  - signInWithApple: navigates externally to /api/auth/apple
 *  - signUpWithEmail: POSTs to signup endpoint, refreshes session
 *  - signInWithEmail: POSTs to signin endpoint, refreshes session
 *  - resetPassword: POSTs to reset endpoint
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
const mockDollarFetch = $fetch as unknown as ReturnType<typeof vi.fn>
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

    test('exposes signUpWithEmail as a function', () => {
      const { signUpWithEmail } = useAuth()
      expect(typeof signUpWithEmail).toBe('function')
    })

    test('exposes signInWithEmail as a function', () => {
      const { signInWithEmail } = useAuth()
      expect(typeof signInWithEmail).toBe('function')
    })

    test('exposes resetPassword as a function', () => {
      const { resetPassword } = useAuth()
      expect(typeof resetPassword).toBe('function')
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

  describe('signUpWithEmail', () => {
    test('POSTs to /api/auth/email/signup with email, password, and name', async () => {
      mockDollarFetch.mockResolvedValueOnce({ confirmationRequired: false })
      const { signUpWithEmail } = useAuth()
      await signUpWithEmail('test@example.com', 'password123', 'Test User')

      expect(mockDollarFetch).toHaveBeenCalledWith('/api/auth/email/signup', {
        method: 'POST',
        body: { email: 'test@example.com', password: 'password123', name: 'Test User' },
      })
    })

    test('refreshes session when confirmation is not required', async () => {
      mockDollarFetch.mockResolvedValueOnce({ confirmationRequired: false })
      const { signUpWithEmail } = useAuth()
      await signUpWithEmail('test@example.com', 'password123')

      expect(mockFetchSession).toHaveBeenCalledOnce()
    })

    test('does not refresh session when confirmation is required', async () => {
      mockDollarFetch.mockResolvedValueOnce({ confirmationRequired: true })
      const { signUpWithEmail } = useAuth()
      await signUpWithEmail('test@example.com', 'password123')

      expect(mockFetchSession).not.toHaveBeenCalled()
    })

    test('returns the API response', async () => {
      mockDollarFetch.mockResolvedValueOnce({ confirmationRequired: true })
      const { signUpWithEmail } = useAuth()
      const result = await signUpWithEmail('test@example.com', 'password123')

      expect(result).toEqual({ confirmationRequired: true })
    })
  })

  describe('signInWithEmail', () => {
    test('POSTs to /api/auth/email/signin with email and password', async () => {
      const { signInWithEmail } = useAuth()
      await signInWithEmail('test@example.com', 'password123')

      expect(mockDollarFetch).toHaveBeenCalledWith('/api/auth/email/signin', {
        method: 'POST',
        body: { email: 'test@example.com', password: 'password123' },
      })
    })

    test('refreshes session after successful sign-in', async () => {
      const { signInWithEmail } = useAuth()
      await signInWithEmail('test@example.com', 'password123')

      expect(mockFetchSession).toHaveBeenCalledOnce()
    })

    test('propagates error on invalid credentials', async () => {
      mockDollarFetch.mockRejectedValueOnce(new Error('Invalid email or password.'))
      const { signInWithEmail } = useAuth()

      await expect(signInWithEmail('test@example.com', 'wrong')).rejects.toThrow('Invalid email or password.')
    })
  })

  describe('resetPassword', () => {
    test('POSTs to /api/auth/email/reset-password with email', async () => {
      const { resetPassword } = useAuth()
      await resetPassword('test@example.com')

      expect(mockDollarFetch).toHaveBeenCalledWith('/api/auth/email/reset-password', {
        method: 'POST',
        body: { email: 'test@example.com' },
      })
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
