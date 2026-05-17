export default defineEventHandler(async (event) => {
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
