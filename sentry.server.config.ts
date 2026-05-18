import * as Sentry from '@sentry/nuxt'

/**
 * True when `err` is an HTTP client error (status 4xx). These are expected,
 * caller-driven outcomes (e.g. a 401 from an expired iOS access token, which
 * the client recovers from via `/api/auth/refresh`) — not server bugs. We drop
 * them from Sentry so the dashboard and quota are reserved for actionable 5xx
 * errors. They are still recorded in the structured request log
 * (`server/middleware/00.logging.ts`). H3 errors expose `statusCode`.
 */
export function isClientError(err: unknown): boolean {
  const statusCode = (err as { statusCode?: unknown } | null | undefined)?.statusCode
  return typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500
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
    // Drop expected 4xx client errors (incl. routine 401 token-expiry from the
    // iOS client) so only actionable 5xx errors reach Sentry. See isClientError.
    beforeSend(event, hint) {
      return isClientError(hint?.originalException) ? null : event
    },
  })
}
