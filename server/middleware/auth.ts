// Paths that do not require authentication
const PUBLIC_PATHS = ['/api/auth/', '/api/_auth/', '/api/health']

/**
 * Global auth guard that protects all non-public API routes.
 * Attaches `event.context.userId` for authenticated requests so downstream handlers don't need to re-read the session.
 * @throws {H3Error} 401 Unauthorized when the session is absent or has no user.
 */
export default defineEventHandler(async (event) => {
  event.context.requestId = crypto.randomUUID()

  if (PUBLIC_PATHS.some((prefix) => event.path.startsWith(prefix))) return

  const session = await getUserSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  event.context.userId = session.user.id
})
