/**
 * Vitest global setup — stubs Nuxt/H3/nuxt-auth-utils auto-import globals
 * so that server and client source files can be imported without the Nuxt
 * transform pipeline.
 *
 * Each stub is a vi.fn() so individual tests can override behaviour with
 * mockReturnValue / mockResolvedValue etc.
 */
import { vi } from 'vitest'

// ── Sentry SDK (imported by server/middleware/auth.ts and server/plugins/sentry.ts) ─
// Mock at module level so any `import * as Sentry from '@sentry/nuxt'` in source
// resolves to spies. Tests can assert on Sentry.setUser / captureException.
vi.mock('@sentry/nuxt', () => ({
  setUser: vi.fn(),
  captureException: vi.fn(),
  withIsolationScope: (fn: (scope: { setTag: () => void; setUser: () => void }) => unknown) =>
    fn({ setTag: vi.fn(), setUser: vi.fn() }),
  prismaIntegration: vi.fn(() => ({})),
  init: vi.fn(),
}))

// ── Nitro compile-time macros ────────────────────────────────────────────────
vi.stubGlobal('defineRouteMeta', vi.fn())
vi.stubGlobal('defineNitroPlugin', (fn: (app: unknown) => unknown) => fn)

// ── H3 helpers (used in server routes and middleware) ─────────────────────────
vi.stubGlobal('defineEventHandler', (fn: (event: unknown) => unknown) => fn)
vi.stubGlobal('getRouterParam', vi.fn())
vi.stubGlobal('getQuery', vi.fn(() => ({})))
vi.stubGlobal('getHeader', vi.fn(() => null))
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
  identity: { findUnique: vi.fn(), create: vi.fn() },
  program: { findMany: vi.fn(), findUnique: vi.fn() },
  programDay: { findUnique: vi.fn(), findFirst: vi.fn() },
  userProgram: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
  workoutSession: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  exercise: { findUnique: vi.fn(), findMany: vi.fn() },
  exerciseSet: { findUnique: vi.fn() },
  completedSet: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  userExerciseNote: { findUnique: vi.fn(), upsert: vi.fn() },
  workoutExerciseSwap: { upsert: vi.fn() },
  refreshToken: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn((args: unknown) => Promise.resolve({ count: 1 })) },
  deviceToken: { upsert: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
})

vi.stubGlobal('sendPush', vi.fn())

// ── Pino logger global (auto-imported via server/utils/logger.ts) ────────────
// Tests assert against logger.error / logger.info argument shapes. `child()`
// returns the same stub so request-scoped child loggers in tests are spy-able.
const loggerStub = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn() as ReturnType<typeof vi.fn>,
}
loggerStub.child.mockReturnValue(loggerStub)
vi.stubGlobal('logger', loggerStub)

// ── Supabase client global (used in Nitro server route handlers via auto-import) ─
vi.stubGlobal('supabase', {
  auth: {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    setSession: vi.fn(),
    updateUser: vi.fn(),
  },
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn().mockResolvedValue({ data: { path: 'test-user/screenshot.png' }, error: null }),
      remove: vi.fn().mockResolvedValue({ data: null, error: null }),
      getPublicUrl: vi.fn(() => ({
        data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/feedback-screenshots/test-user/screenshot.png' },
      })),
    })),
  },
})

// ── Server utility auto-imports (server/utils/) ──────────────────────────────
// Default: allow all emails so existing tests pass unmodified.
// Override per-test with mockReturnValueOnce(false) to exercise blocking paths.
vi.stubGlobal('isEmailAllowed', vi.fn(() => true))
// Account-linking helper — default to a no-op vi.fn(); each route test overrides
// with a resolved User. Real logic is exercised by server/utils/auth.test.ts.
vi.stubGlobal('findOrLinkUser', vi.fn())
// JWT utilities — default to no-op; override per-test as needed
vi.stubGlobal('signAccessToken', vi.fn())
vi.stubGlobal('signRefreshToken', vi.fn())
vi.stubGlobal('verifyAccessToken', vi.fn())
// JWKS identity token verifiers — default to no-op; override per-test as needed
vi.stubGlobal('verifyAppleIdentityToken', vi.fn())
vi.stubGlobal('verifyGoogleIdToken', vi.fn())
// Rate limiting — no-op by default in tests (Upstash not configured)
vi.stubGlobal('rateLimitByIp', vi.fn().mockResolvedValue(undefined))

// ── H3 request helpers ───────────────────────────────────────────────────────
vi.stubGlobal('getRequestURL', vi.fn(() => new URL('http://localhost:3000/api/auth/email/test')))
vi.stubGlobal('getMethod', vi.fn(() => 'GET'))

// ── Nuxt runtime config ─────────────────────────────────────────────────────
vi.stubGlobal('useRuntimeConfig', vi.fn(() => ({
  supabaseUrl: 'https://test.supabase.co',
  supabaseServiceRoleKey: 'test-service-role-key',
  jwtAccessSecret: 'test-access-secret-that-is-at-least-32-chars-long',
  jwtRefreshSecret: 'test-refresh-secret-that-is-at-least-32-chars-long',
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
