import * as Sentry from '@sentry/nuxt'

const dsn = process.env.SENTRY_DSN

if (dsn) {
  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development'
  const release = process.env.VERCEL_GIT_COMMIT_SHA
  const tracesSampleRate = Number(
    process.env.SENTRY_TRACES_SAMPLE_RATE ?? (environment === 'production' ? 0.2 : 1.0),
  )

  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate,
    integrations: [Sentry.prismaIntegration()],
  })
}
