/**
 * Vitest global setup — stubs Nuxt/H3/nuxt-auth-utils auto-import globals
 * so that server and client source files can be imported without the Nuxt
 * transform pipeline.
 *
 * Each stub is a vi.fn() so individual tests can override behaviour with
 * mockReturnValue / mockResolvedValue etc.
 */
import { vi } from 'vitest'

// ── Sentry SDK (imported by server/middleware/auth.ts) ───────────────────────
// Mock at module level so `import * as Sentry from '@sentry/nuxt'` in source
// resolves to spies. Tests assert on setUser / setTag / captureException.
vi.mock('@sentry/nuxt', () => ({
  setUser: vi.fn(),
  setTag: vi.fn(),
  captureException: vi.fn(),
}))

// ── Nitro compile-time macros ────────────────────────────────────────────────
vi.stubGlobal('defineRouteMeta', vi.fn())

// ── H3 helpers (used in server routes and middleware) ─────────────────────────
vi.stubGlobal('defineEventHandler', (fn: (event: unknown) => unknown) => fn)
vi.stubGlobal('getRouterParam', vi.fn())
vi.stubGlobal('getQuery', vi.fn(() => ({})))
vi.stubGlobal('getHeader', vi.fn(() => null))
vi.stubGlobal('getRequestHeader', vi.fn(() => undefined))
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
// Apple's route wraps the library call in its own defineEventHandler (to supply
// a redirectURL fallback), so the return value has to be CALLABLE. Object.assign
// keeps the config readable off the result, which is what config-shape
// assertions rely on.
// The returned handler is itself a spy, so tests can assert it was invoked with
// the original event; Object.assign keeps the config readable off the result.
vi.stubGlobal(
  'defineOAuthAppleEventHandler',
  vi.fn((config: Record<string, unknown>) =>
    Object.assign(vi.fn((_event: unknown) => config), config),
  ),
)

// ── Nitro runtime config / request helpers ───────────────────────────────────
// Defaults are the "configured correctly" case; tests override per-case.
vi.stubGlobal('useRuntimeConfig', vi.fn(() => ({
  oauth: { apple: { redirectURL: 'https://fitness-app.me/api/auth/apple' } },
})))
vi.stubGlobal('getRequestURL', vi.fn(() => new URL('http://localhost:3000/api/auth/apple')))

// ── Prisma client global (used in Nitro server route handlers via auto-import) ─
// Individual test files can reconfigure prisma.user.upsert etc. per-test via
// the shared mock reference they import from this setup context.
vi.stubGlobal('prisma', {
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
  user: { upsert: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  identity: { findUnique: vi.fn(), create: vi.fn() },
  program: { findMany: vi.fn(), findUnique: vi.fn() },
  programDay: { findUnique: vi.fn(), findFirst: vi.fn() },
  userProgram: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
  workoutSession: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  exercise: { findUnique: vi.fn(), findMany: vi.fn() },
  exerciseSet: { findUnique: vi.fn() },
  completedSet: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  coreWorkout: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
  coreWorkoutExercise: { createMany: vi.fn(), deleteMany: vi.fn() },
  userExerciseNote: { findUnique: vi.fn(), upsert: vi.fn() },
  workoutExerciseSwap: { upsert: vi.fn() },
  workoutExerciseSkip: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  refreshToken: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn((args: unknown) => Promise.resolve({ count: 1 })) },
  deviceToken: { upsert: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  feedback: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  standaloneWorkout: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  standaloneWorkoutSet: { findUnique: vi.fn() },
  standaloneWorkoutSession: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
  standaloneCompletedSet: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  ptRoutine: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
  ptRoutineExercise: { createMany: vi.fn(), deleteMany: vi.fn() },
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
    // Service-role admin API — used by DELETE /api/auth/me to remove the
    // GoTrue user behind an email identity.
    admin: { deleteUser: vi.fn() },
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
// Account-linking helper — default to a no-op vi.fn(); each route test overrides
// with a resolved User. Real logic is exercised by server/utils/auth.test.ts.
vi.stubGlobal('findOrLinkUser', vi.fn())
// JWT utilities — default to no-op; override per-test as needed
vi.stubGlobal('signAccessToken', vi.fn())
vi.stubGlobal('signRefreshToken', vi.fn())
vi.stubGlobal('verifyAccessToken', vi.fn())
// Best-effort unverified-sub decoder used by auth.ts on failed Bearer verify.
// Default returns null (no decodable sub); override per-test. Real logic is
// exercised by server/utils/jwt.test.ts.
vi.stubGlobal('decodeUnverifiedSub', vi.fn(() => null))
// Classifies a failed-verify error as a token problem (401) vs a server
// misconfig (rethrow). Default true so the common "bad token → 401" path
// holds; override with mockReturnValueOnce(false) for the server-error case.
// Real logic is exercised by server/utils/jwt.test.ts.
vi.stubGlobal('isJwtVerificationError', vi.fn(() => true))
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
