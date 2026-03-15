/**
 * Vitest global setup — stubs Nuxt/H3/nuxt-auth-utils auto-import globals
 * so that server and client source files can be imported without the Nuxt
 * transform pipeline.
 *
 * Each stub is a vi.fn() so individual tests can override behaviour with
 * mockReturnValue / mockResolvedValue etc.
 */
import { vi } from 'vitest'

// ── Nitro compile-time macros ────────────────────────────────────────────────
vi.stubGlobal('defineRouteMeta', vi.fn())

// ── H3 helpers (used in server routes and middleware) ─────────────────────────
vi.stubGlobal('defineEventHandler', (fn: (event: unknown) => unknown) => fn)
vi.stubGlobal('getRouterParam', vi.fn())
vi.stubGlobal('readBody', vi.fn())
vi.stubGlobal('createError', vi.fn((opts: { statusCode: number; statusMessage: string }) => {
  const err = new Error(opts.statusMessage) as Error & {
    statusCode: number
    statusMessage: string
  }
  err.statusCode = opts.statusCode
  err.statusMessage = opts.statusMessage
  return err
}))
vi.stubGlobal('sendRedirect', vi.fn())

// ── nuxt-auth-utils helpers ───────────────────────────────────────────────────
vi.stubGlobal('getUserSession', vi.fn())
vi.stubGlobal('setUserSession', vi.fn())
vi.stubGlobal('clearUserSession', vi.fn())

// ── nuxt-auth-utils OAuth handlers ───────────────────────────────────────────
// These wrap the config object and return it unchanged so tests can access
// onSuccess / onError directly after importing the handler module.
vi.stubGlobal('defineOAuthGoogleEventHandler', (config: unknown) => config)
vi.stubGlobal('defineOAuthAppleEventHandler', (config: unknown) => config)

// ── Prisma client global (used in Nitro server route handlers via auto-import) ─
// Individual test files can reconfigure prisma.user.upsert etc. per-test via
// the shared mock reference they import from this setup context.
vi.stubGlobal('prisma', {
  $queryRaw: vi.fn(),
  user: { upsert: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  program: { findMany: vi.fn(), findUnique: vi.fn() },
  userProgram: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  workoutSession: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  completedSet: { create: vi.fn(), findMany: vi.fn() },
})

// ── Nuxt composable / navigation globals (used in app/composables) ────────────
vi.stubGlobal('useUserSession', vi.fn())
vi.stubGlobal('navigateTo', vi.fn())
vi.stubGlobal('$fetch', vi.fn())
