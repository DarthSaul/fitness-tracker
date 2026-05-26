import * as Sentry from '@sentry/nuxt'

/**
 * True when `err` is an expected/noisy client error we deliberately drop from
 * Sentry. Today that is exactly 401 (Unauthorized), which the iOS client emits
 * on every 15-min access-token expiry and then recovers from via
 * `/api/auth/refresh`. Other 4xx (400 validation bugs, 403 authorization
 * failures, 409 state conflicts, 422 unprocessable, 429 rate limits) are
 * actionable and should reach Sentry. All errors still land in the structured
 * request log (`server/middleware/00.logging.ts`). H3 errors expose `statusCode`.
 */
export function isExpectedClientError(err: unknown): boolean {
  const statusCode = (err as { statusCode?: unknown } | null | undefined)?.statusCode
  return statusCode === 401
}

const dsn = process.env.SENTRY_DSN

if (dsn) {
  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development'
  const release = process.env.VERCEL_GIT_COMMIT_SHA
  const defaultTracesSampleRate = environment === 'production' ? 0.2 : 1.0
  const parsed = Number(process.env.SENTRY_TRACES_SAMPLE_RATE)
  // SENTRY_TRACES_SAMPLE_RATE is operator-set env input; a typo'd or empty
  // value yields NaN/out-of-range, which Sentry treats as undefined sampling.
  const tracesSampleRate =
    Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : defaultTracesSampleRate

  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate,
    integrations: [Sentry.prismaIntegration()],
    // Drop only known-noisy 4xx (today: 401 from routine iOS token expiry).
    // Everything else — including 4xx like 409 that indicate real client/server
    // state bugs — flows through to Sentry. See isExpectedClientError.
    beforeSend(event, hint) {
      return isExpectedClientError(hint?.originalException) ? null : event
    },
  })
}
