import * as Sentry from '@sentry/nuxt'

export default defineEventHandler(async (event) => {
  // TEMPORARY — self-diagnosing Sentry smoke probe. Remove before merge.
  // Returns whether Sentry.init() actually ran in this serverless function and
  // the captured event id, and explicitly flushes so the event isn't dropped
  // when the Vercel function suspends. Trigger with header `x-sentry-smoke: 1`.
  if (getHeader(event, 'x-sentry-smoke')) {
    const initialized = Boolean(Sentry.getClient())
    const eventId = Sentry.captureException(new Error('sentry smoke test'))
    const flushed = await Sentry.flush(3000)
    return { sentrySmoke: true, initialized, eventId, flushed }
  }

  try {
    await prisma.$queryRaw`SELECT 1`
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    ;(event.context.logger ?? logger).error({ err: error }, 'Health check failed: database unreachable')
    throw createError({ statusCode: 503, statusMessage: 'Database connection failed' })
  }
})
