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
  $transaction: vi.fn(),
  user: { upsert: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  program: { findMany: vi.fn(), findUnique: vi.fn() },
  programDay: { findUnique: vi.fn(), findFirst: vi.fn() },
  userProgram: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
  workoutSession: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  exerciseSet: { findUnique: vi.fn() },
  completedSet: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
})

// ── Supabase client global (used in Nitro server route handlers via auto-import) ─
vi.stubGlobal('supabase', {
  auth: {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    setSession: vi.fn(),
    updateUser: vi.fn(),
  },
})

// ── H3 request helpers ───────────────────────────────────────────────────────
vi.stubGlobal('getRequestURL', vi.fn(() => new URL('http://localhost:3000/api/auth/email/test')))

// ── Nuxt runtime config ─────────────────────────────────────────────────────
vi.stubGlobal('useRuntimeConfig', vi.fn(() => ({
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-anon-key',
})))

// ── Nuxt composable / navigation globals (used in app/composables) ────────────
vi.stubGlobal('useUserSession', vi.fn())
vi.stubGlobal('navigateTo', vi.fn())
vi.stubGlobal('$fetch', vi.fn())

// ── Nuxt page / layout macros (used in app/pages and app/layouts) ─────────────
vi.stubGlobal('definePageMeta', vi.fn())
vi.stubGlobal('defineNuxtRouteMiddleware', (fn: (to: unknown) => unknown) => fn)

// ── Nuxt composables (used in app/pages) ──────────────────────────────────────
vi.stubGlobal('useFetch', vi.fn(() => ({ data: ref(null), status: ref('idle'), error: ref(null) })))
vi.stubGlobal('useRoute', vi.fn(() => ({ path: '/' })))
vi.stubGlobal('useNuxtApp', vi.fn())

// ── Vue globals (used in components/pages without explicit imports) ────────────
vi.stubGlobal('ref', (val: unknown) => ({ value: val }))
vi.stubGlobal('computed', (fn: () => unknown) => ({ value: fn() }))
