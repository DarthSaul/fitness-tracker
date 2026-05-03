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

  // Only guard API and OpenAPI routes — let page SSR requests through for client-side auth handling
  if (!event.path.startsWith('/api/') && !event.path.startsWith('/_openapi')) return

  if (PUBLIC_EXACT.includes(event.path) || PUBLIC_PREFIXES.some((p) => event.path.startsWith(p))) return

  const authHeader = getHeader(event, 'authorization')
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i)
  if (bearerMatch) {
    const token = bearerMatch[1].trim()
    try {
      const payload = await verifyAccessToken(token)
      event.context.userId = payload.sub
      event.context.authMethod = 'jwt'
      return
    } catch {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
  }

  const session = await getUserSession(event)
  if (session?.user) {
    event.context.userId = session.user.id
    event.context.authMethod = 'session'
    return
  }

  throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
})
