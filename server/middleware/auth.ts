// Path prefixes that do not require authentication
const PUBLIC_PREFIXES = ['/api/auth/', '/api/_auth/', '/api/docs', '/_openapi']
// Exact paths that do not require authentication
const PUBLIC_EXACT = ['/api/health']

/**
 * Global auth guard that protects all non-public API routes.
 * Attaches `event.context.userId` for authenticated requests so downstream handlers don't need to re-read the session.
 * @throws {H3Error} 401 Unauthorized when the session is absent or has no user.
 */
export default defineEventHandler(async (event) => {
  event.context.requestId = crypto.randomUUID()

  if (PUBLIC_EXACT.includes(event.path) || PUBLIC_PREFIXES.some((p) => event.path.startsWith(p))) return

  const session = await getUserSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  event.context.userId = session.user.id
})
