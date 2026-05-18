import * as Sentry from '@sentry/nuxt'

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
  })
}
