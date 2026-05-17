export default defineEventHandler(async (event) => {
  // TEMPORARY — Sentry smoke test. Remove before merge.
  // Trigger with: GET /api/health?sentrySmoke=1 (public route, no auth required).
  if (getQuery(event).sentrySmoke) {
    throw new Error('sentry smoke test')
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
