/**
 * Vitest global setup — stubs Nuxt/H3/nuxt-auth-utils auto-import globals
 * so that server and client source files can be imported without the Nuxt
 * transform pipeline.
 *
 * Each stub is a vi.fn() so individual tests can override behaviour with
 * mockReturnValue / mockResolvedValue etc.
 */
import { vi } from 'vitest'

import { publicUserSelect } from './server/utils/public-user'
import { followSelect } from './server/utils/follows'
import { postPhotoPath, POST_PHOTOS_BUCKET } from './server/utils/post-photo-storage'
import { parseReactionEmoji, REACTION_CAP } from './server/utils/reactions'
import { postSelect, toPostPayloads, parsePageQuery, pageWhere, newestFirst, parsePostBody, parsePostContent } from './server/utils/posts'
import { parseReportInput } from './server/utils/reports'
import { isApnsDeviceToken } from './server/utils/device-tokens'
import { parseUsername, normalizeUsername, usernameProblem } from './server/utils/usernames'
import { meSelect, parseBio } from './server/utils/profile'
import { notificationSelect, toNotificationPayload, inboxWhere, notificationKeys } from './server/utils/notifications'
import { NOTIFICATION_TYPES, formatReminderTime, parseReminderTime, isValidTimeZone, loadNotificationPreferences, parseReminderDay, formatReminderDay } from './server/utils/notification-preferences'

// ── Sentry SDK (imported by server/middleware/auth.ts) ───────────────────────
// Mock at module level so `import * as Sentry from '@sentry/nuxt'` in source
// resolves to spies. Tests assert on setUser / setTag / captureException.
vi.mock('@sentry/nuxt', () => ({
  setUser: vi.fn(),
  setTag: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
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
vi.stubGlobal('readMultipartFormData', vi.fn())
vi.stubGlobal('createError', vi.fn((opts: { statusCode: number; statusMessage: string; data?: unknown }) => {
  const err = new Error(opts.statusMessage) as Error & {
    statusCode: number
    statusMessage: string
    data?: unknown
  }
  err.statusCode = opts.statusCode
  err.statusMessage = opts.statusMessage
  err.data = opts.data
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
  oauth: { apple: { redirectURL: 'https://drdumbbell.app/api/auth/apple' } },
})))
vi.stubGlobal('getRequestURL', vi.fn(() => new URL('http://localhost:3000/api/auth/apple')))

// ── Prisma client global (used in Nitro server route handlers via auto-import) ─
// Individual test files can reconfigure prisma.user.upsert etc. per-test via
// the shared mock reference they import from this setup context.
vi.stubGlobal('prisma', {
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
  user: { upsert: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  identity: { findUnique: vi.fn(), create: vi.fn() },
  program: { findMany: vi.fn(), findUnique: vi.fn() },
  programDay: { findUnique: vi.fn(), findFirst: vi.fn() },
  userProgram: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  workoutSession: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
  scheduledWorkout: { findMany: vi.fn(), deleteMany: vi.fn() },
  exercise: { findUnique: vi.fn(), findMany: vi.fn() },
  exerciseSet: { findUnique: vi.fn() },
  completedSet: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  coreWorkout: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
  coreWorkoutExercise: { createMany: vi.fn(), deleteMany: vi.fn() },
  userExerciseNote: { findUnique: vi.fn(), upsert: vi.fn() },
  workoutExerciseSwap: { upsert: vi.fn() },
  workoutExerciseSkip: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  refreshToken: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn((args: unknown) => Promise.resolve({ count: 1 })) },
  deviceToken: { upsert: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  postReaction: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), groupBy: vi.fn(), count: vi.fn() },
  postPhoto: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  post: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  follow: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), updateManyAndReturn: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
  userBlock: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  report: { findFirst: vi.fn(), create: vi.fn() },
  notification: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), createMany: vi.fn(), createManyAndReturn: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
  notificationPreference: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
  feedback: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  standaloneWorkout: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  standaloneWorkoutSet: { findUnique: vi.fn() },
  standaloneWorkoutSession: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), count: vi.fn() },
  standaloneCompletedSet: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  ptRoutine: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
  ptRoutineExercise: { createMany: vi.fn(), deleteMany: vi.fn() },
})

vi.stubGlobal('sendPush', vi.fn())

// Social: the real select object, so route tests assert the exact shape.
vi.stubGlobal('publicUserSelect', publicUserSelect)
vi.stubGlobal('isBlockedEitherWay', vi.fn().mockResolvedValue(false))
vi.stubGlobal('blockedUserIds', vi.fn().mockResolvedValue([]))
vi.stubGlobal('rateLimitByKey', vi.fn().mockResolvedValue(undefined))
vi.stubGlobal('followSelect', followSelect)
vi.stubGlobal('isFollowing', vi.fn().mockResolvedValue(false))
vi.stubGlobal('followStatesWith', vi.fn().mockResolvedValue(new Map()))
vi.stubGlobal('followingIdsOf', vi.fn().mockResolvedValue([]))
// Posts: real pure helpers; canViewPostsBy is mocked so routes are tested against the rule's outcome.
vi.stubGlobal('postSelect', postSelect)
vi.stubGlobal('toPostPayloads', toPostPayloads)
vi.stubGlobal('parsePostContent', parsePostContent)
vi.stubGlobal('parsePageQuery', parsePageQuery)
vi.stubGlobal('pageWhere', pageWhere)
vi.stubGlobal('newestFirst', newestFirst)
vi.stubGlobal('parsePostBody', parsePostBody)
vi.stubGlobal('canViewPostsBy', vi.fn().mockResolvedValue(true))
// Post photos: processing and storage are mocked in route tests (both have
// their own unit tests — processing on real image bytes).
vi.stubGlobal('postPhotoPath', postPhotoPath)
vi.stubGlobal('POST_PHOTOS_BUCKET', POST_PHOTOS_BUCKET)
vi.stubGlobal('processPostPhoto', vi.fn())
vi.stubGlobal('uploadPostPhotoObject', vi.fn().mockResolvedValue(undefined))
vi.stubGlobal('removePostPhotoObjects', vi.fn().mockResolvedValue(undefined))
vi.stubGlobal('signPostPhotos', vi.fn().mockResolvedValue({ urls: new Map(), expiresAt: null }))
// Reactions: the real emoji parser and cap; summaries and the visibility gate
// are mocked in route tests (both have their own unit tests).
vi.stubGlobal('parseReactionEmoji', parseReactionEmoji)
vi.stubGlobal('REACTION_CAP', REACTION_CAP)
vi.stubGlobal('reactionSummaries', vi.fn().mockResolvedValue(new Map()))
vi.stubGlobal('requireVisiblePost', vi.fn())
// Device tokens: the real format check (it has its own unit tests).
vi.stubGlobal('isApnsDeviceToken', isApnsDeviceToken)
// Reports: the real input parser (it has its own unit tests).
vi.stubGlobal('parseReportInput', parseReportInput)
// Usernames and profile: the real pure helpers (each has its own unit tests).
vi.stubGlobal('parseUsername', parseUsername)
vi.stubGlobal('normalizeUsername', normalizeUsername)
vi.stubGlobal('usernameProblem', usernameProblem)
vi.stubGlobal('meSelect', meSelect)
vi.stubGlobal('parseBio', parseBio)
// Profile stats: mocked in route tests (the helper has its own unit tests).
vi.stubGlobal('profileStats', vi.fn().mockResolvedValue({ activeProgram: null, completedWorkoutCount: null }))
// Notifications: real pure helpers; writes, delivery and the badge count are
// mocked in route tests (server/utils/notifications.test.ts covers them).
vi.stubGlobal('notificationSelect', notificationSelect)
vi.stubGlobal('toNotificationPayload', toNotificationPayload)
vi.stubGlobal('inboxWhere', inboxWhere)
vi.stubGlobal('notify', vi.fn().mockResolvedValue(null))
vi.stubGlobal('retract', vi.fn().mockResolvedValue(undefined))
vi.stubGlobal('notifyEach', vi.fn().mockResolvedValue([]))
vi.stubGlobal('clearNotificationsBetween', vi.fn().mockResolvedValue(undefined))
vi.stubGlobal('notifySystem', vi.fn().mockResolvedValue([]))
vi.stubGlobal('dismissUnfinishedReminder', vi.fn().mockResolvedValue({ count: 0 }))
vi.stubGlobal('runNotificationSweep', vi.fn())
vi.stubGlobal('isAuthorizedCronRequest', vi.fn().mockReturnValue(false))
vi.stubGlobal('notificationKeys', notificationKeys)
vi.stubGlobal('pushAfterCommit', vi.fn())
vi.stubGlobal('deliverPush', vi.fn().mockResolvedValue('skipped'))
vi.stubGlobal('unreadCount', vi.fn().mockResolvedValue(0))
vi.stubGlobal('NOTIFICATION_TYPES', NOTIFICATION_TYPES)
vi.stubGlobal('formatReminderTime', formatReminderTime)
vi.stubGlobal('parseReminderTime', parseReminderTime)
vi.stubGlobal('isValidTimeZone', isValidTimeZone)
vi.stubGlobal('loadNotificationPreferences', loadNotificationPreferences)
vi.stubGlobal('parseReminderDay', parseReminderDay)
vi.stubGlobal('formatReminderDay', formatReminderDay)
// Runs the callback immediately with the prisma mock as the transaction client;
// tests that care about lock scope override this per-test.
vi.stubGlobal('withPairLock', vi.fn((_a: string, _b: string, fn: (tx: unknown) => unknown) => fn(globalThis.prisma)))

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
    resend: vi.fn(),
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
// Signup-name backfill — pass-through by default so sign-in route tests see the
// findOrLinkUser user unchanged. Real logic is exercised by server/utils/auth.test.ts.
vi.stubGlobal('backfillNameFromMetadata', vi.fn(async (user: unknown) => user))
// Native token-pair minting — default to a no-op vi.fn(); route tests override
// with a resolved pair. Real logic is exercised by server/utils/native-tokens.test.ts.
vi.stubGlobal('issueTokenPair', vi.fn())
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
// Signed exercise-media URLs — default no-op; the info route test overrides it.
// Real logic is exercised by server/utils/exercise-media.test.ts.
vi.stubGlobal('signExerciseMedia', vi.fn())

// ── H3 request helpers ───────────────────────────────────────────────────────
vi.stubGlobal('getRequestURL', vi.fn(() => new URL('http://localhost:3000/api/auth/email/test')))
vi.stubGlobal('getMethod', vi.fn(() => 'GET'))

// ── Nuxt runtime config ─────────────────────────────────────────────────────
vi.stubGlobal('useRuntimeConfig', vi.fn(() => ({
  supabaseUrl: 'https://test.supabase.co',
  supabaseServiceRoleKey: 'test-service-role-key',
  jwtAccessSecret: 'test-access-secret-that-is-at-least-32-chars-long',
  jwtRefreshSecret: 'test-refresh-secret-that-is-at-least-32-chars-long',
  public: {
    appUrl: 'http://localhost:3000',
  },
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
