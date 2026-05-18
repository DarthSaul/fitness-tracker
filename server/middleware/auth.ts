import * as Sentry from '@sentry/nuxt'

// Path prefixes that do not require authentication
const PUBLIC_PREFIXES = ['/api/auth/', '/api/_auth/', '/api/docs', '/_openapi']
// Exact paths that do not require authentication
const PUBLIC_EXACT = ['/api/health']
// Exact paths nested under a PUBLIC_PREFIXES entry that still require auth.
// Listed here so we don't have to slice prefixes into ever-narrower patterns.
const PROTECTED_EXACT = ['/api/auth/me']

/**
 * Global auth guard that protects all non-public API routes.
 * Attaches `event.context.userId` for authenticated requests so downstream handlers don't need to re-read the session.
 * Binds the authenticated user to the per-request Sentry isolation scope that `@sentry/nuxt` opens around every Nitro request.
 * @throws {H3Error} 401 Unauthorized when the session is absent or has no user.
 */
export default defineEventHandler(async (event) => {
  // Only guard API and OpenAPI routes — let page SSR requests through for client-side auth handling
  if (!event.path.startsWith('/api/') && !event.path.startsWith('/_openapi')) return

  // Let CORS preflight requests through — OPTIONS must not require auth
  if (getMethod(event) === 'OPTIONS') return

  if (!PROTECTED_EXACT.includes(event.path)) {
    if (PUBLIC_EXACT.includes(event.path) || PUBLIC_PREFIXES.some((p) => event.path.startsWith(p))) return
  }

  const authHeader = getHeader(event, 'authorization')
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i)
  if (bearerMatch) {
    const token = bearerMatch[1]!.trim()
    try {
      const payload = await verifyAccessToken(token)
      event.context.userId = payload.sub
      event.context.authMethod = 'jwt'
      Sentry.setUser({ id: payload.sub })
      return
    } catch {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
  }

  const session = await getUserSession(event)
  if (session?.user) {
    event.context.userId = session.user.id
    event.context.authMethod = 'session'
    Sentry.setUser({ id: session.user.id })
    return
  }

  throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
})
