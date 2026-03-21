/**
 * Tests for app/middleware/auth.global.ts
 *
 * Coverage strategy:
 *  - Root redirect: / → /app (logged in) or /login (logged out)
 *  - /programs protection: unauthenticated redirects to /login
 *  - /programs sub-paths: unauthenticated redirects to /login
 *  - /programs does NOT redirect authenticated users
 *  - /app protection: unauthenticated redirects to /login (regression guard)
 *  - /app sub-paths: unauthenticated redirects to /login
 *  - /app does NOT redirect authenticated users
 *  - /workout protection: unauthenticated redirects to /login
 *  - /workout does NOT redirect authenticated users
 *  - /login redirect: authenticated users are sent to /app
 *  - /login is accessible to unauthenticated users (no redirect)
 *  - Unrelated public paths pass through without redirecting
 *
 * vitest.setup.ts stubs defineNuxtRouteMiddleware to pass the handler function
 * through directly, and stubs useUserSession / navigateTo as vi.fn() so each
 * test can configure the auth state it needs.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

// The default export is the middleware function itself because
// defineNuxtRouteMiddleware is stubbed to be an identity function.
import middleware from './auth.global'

// ── Stub references ────────────────────────────────────────────────────────
const mockUseUserSession = useUserSession as ReturnType<typeof vi.fn>
const mockNavigateTo = navigateTo as ReturnType<typeof vi.fn>

// Convenience factory: creates the minimal `to` route object the middleware
// expects — just the `path` property.
function makeTo(path: string): { path: string } {
  return { path }
}

// Type alias for the imported middleware after the stub unwraps it.
type MiddlewareFn = (to: { path: string }) => unknown

describe('app/middleware/auth.global', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigateTo.mockResolvedValue(undefined)
  })

  // ── Helper to set auth state for the current test ────────────────────────
  function setLoggedIn(value: boolean) {
    mockUseUserSession.mockReturnValue({ loggedIn: { value } })
  }

  describe('root path (/)', () => {
    test('redirects authenticated users to /app', () => {
      setLoggedIn(true)
      ;(middleware as MiddlewareFn)(makeTo('/'))
      expect(mockNavigateTo).toHaveBeenCalledWith('/app')
    })

    test('redirects unauthenticated users to /login', () => {
      setLoggedIn(false)
      ;(middleware as MiddlewareFn)(makeTo('/'))
      expect(mockNavigateTo).toHaveBeenCalledWith('/login')
    })

    test('does not fall through to the protected-prefix check', () => {
      setLoggedIn(false)
      ;(middleware as MiddlewareFn)(makeTo('/'))
      // navigateTo is called once for the root redirect, not again for a
      // protected-prefix 401 redirect
      expect(mockNavigateTo).toHaveBeenCalledOnce()
    })
  })

  describe('/programs route protection', () => {
    test('redirects unauthenticated users on /programs to /login', () => {
      setLoggedIn(false)
      ;(middleware as MiddlewareFn)(makeTo('/programs'))
      expect(mockNavigateTo).toHaveBeenCalledWith('/login')
    })

    test('redirects unauthenticated users on /programs/something to /login', () => {
      setLoggedIn(false)
      ;(middleware as MiddlewareFn)(makeTo('/programs/something'))
      expect(mockNavigateTo).toHaveBeenCalledWith('/login')
    })

    test('redirects unauthenticated users on deep /programs sub-paths to /login', () => {
      setLoggedIn(false)
      ;(middleware as MiddlewareFn)(makeTo('/programs/clprog001/weeks/1'))
      expect(mockNavigateTo).toHaveBeenCalledWith('/login')
    })

    test('does NOT redirect authenticated users on /programs', () => {
      setLoggedIn(true)
      ;(middleware as MiddlewareFn)(makeTo('/programs'))
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })

    test('does NOT redirect authenticated users on /programs sub-paths', () => {
      setLoggedIn(true)
      ;(middleware as MiddlewareFn)(makeTo('/programs/clprog001'))
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })
  })

  describe('/app route protection (regression guard)', () => {
    test('redirects unauthenticated users on /app to /login', () => {
      setLoggedIn(false)
      ;(middleware as MiddlewareFn)(makeTo('/app'))
      expect(mockNavigateTo).toHaveBeenCalledWith('/login')
    })

    test('redirects unauthenticated users on /app/dashboard to /login', () => {
      setLoggedIn(false)
      ;(middleware as MiddlewareFn)(makeTo('/app/dashboard'))
      expect(mockNavigateTo).toHaveBeenCalledWith('/login')
    })

    test('does NOT redirect authenticated users on /app', () => {
      setLoggedIn(true)
      ;(middleware as MiddlewareFn)(makeTo('/app'))
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })

    test('does NOT redirect authenticated users on /app sub-paths', () => {
      setLoggedIn(true)
      ;(middleware as MiddlewareFn)(makeTo('/app/workout/active'))
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })
  })

  describe('/login route behaviour', () => {
    test('redirects authenticated users on /login to /app', () => {
      setLoggedIn(true)
      ;(middleware as MiddlewareFn)(makeTo('/login'))
      expect(mockNavigateTo).toHaveBeenCalledWith('/app')
    })

    test('does NOT redirect unauthenticated users on /login', () => {
      setLoggedIn(false)
      ;(middleware as MiddlewareFn)(makeTo('/login'))
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })
  })

  describe('/workout route protection', () => {
    test('redirects unauthenticated users on /workout/abc to /login', () => {
      setLoggedIn(false)
      ;(middleware as MiddlewareFn)(makeTo('/workout/abc'))
      expect(mockNavigateTo).toHaveBeenCalledWith('/login')
    })

    test('does NOT redirect authenticated users on /workout/abc', () => {
      setLoggedIn(true)
      ;(middleware as MiddlewareFn)(makeTo('/workout/abc'))
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })
  })

  describe('prefix boundary — /programsother should not be protected', () => {
    test('does not redirect unauthenticated users on a path that starts with /programs but is not /programs or /programs/', () => {
      setLoggedIn(false)
      // e.g., a hypothetical /programslist path must not be treated as /programs
      ;(middleware as MiddlewareFn)(makeTo('/programslist'))
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })

    test('does not redirect unauthenticated users on a path that starts with /app but is not /app or /app/', () => {
      setLoggedIn(false)
      ;(middleware as MiddlewareFn)(makeTo('/application'))
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })
  })

  describe('unprotected public paths', () => {
    test('does not redirect unauthenticated users on /about', () => {
      setLoggedIn(false)
      ;(middleware as MiddlewareFn)(makeTo('/about'))
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })

    test('does not redirect authenticated users on /about', () => {
      setLoggedIn(true)
      ;(middleware as MiddlewareFn)(makeTo('/about'))
      expect(mockNavigateTo).not.toHaveBeenCalled()
    })
  })
})
