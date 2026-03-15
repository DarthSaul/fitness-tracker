export default defineEventHandler(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    console.error('Health check failed: database unreachable', error)
    throw createError({ statusCode: 503, statusMessage: 'Database connection failed' })
  }
})
