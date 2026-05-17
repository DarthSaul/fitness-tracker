export default defineEventHandler(async (event) => {
  // TEMPORARY — Sentry smoke test. Remove before merge.
  // Gated on a header, not a query param: event.path includes the query string,
  // so `/api/health?x=1` would miss the auth middleware's exact-match public
  // carve-out and 401 before reaching here. Trigger with header `x-sentry-smoke: 1`.
  if (getHeader(event, 'x-sentry-smoke')) {
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
