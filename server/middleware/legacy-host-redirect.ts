/**
 * Staged domain cutover: 308s web traffic on a legacy host to the same path on
 * the primary origin (`runtimeConfig.public.appUrl`), while `/api/**` keeps
 * being served in place.
 *
 * The API carve-out exists because the v1.0 iOS build has the legacy origin
 * baked into its API_BASE_URL. Once an iOS update carrying the new origin has
 * propagated, the legacy domain becomes a plain Vercel domain-level redirect
 * and this file is deleted, along with `legacyHosts` in nuxt.config.ts and
 * NUXT_LEGACY_HOSTS in .env.example. Nothing else references it.
 *
 * Only GET and HEAD are redirected: a 308 preserves the method and body, but a
 * browser will not replay a cross-origin POST with the legacy host's cookies,
 * so redirecting a write would just fail differently. Empty `legacyHosts` (the
 * local and CI default) makes this a no-op.
 */

let warnedMissingAppUrl = false

/** Lowercased hostname with any `:port` removed, so `Fitness-App.me:443` matches. */
function normaliseHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, '')
}

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)

  const legacyHosts = String(config.legacyHosts ?? '')
    .split(',')
    .map(normaliseHost)
    .filter(Boolean)
  if (legacyHosts.length === 0) return

  if (event.method !== 'GET' && event.method !== 'HEAD') return
  if (event.path.startsWith('/api/')) return

  // Vercel terminates TLS and forwards the original host in X-Forwarded-Host.
  const host = normaliseHost(getRequestHost(event, { xForwardedHost: true }))
  if (!legacyHosts.includes(host)) return

  const appUrl = String(config.public.appUrl ?? '').replace(/\/+$/, '')
  if (!appUrl) {
    // Once per server instance, not per request: a missing origin is a
    // deployment misconfiguration, and the legacy host keeps serving meanwhile.
    if (!warnedMissingAppUrl) {
      warnedMissingAppUrl = true
      logger.warn(
        { legacyHosts },
        'legacy-host-redirect: NUXT_LEGACY_HOSTS is set but NUXT_PUBLIC_APP_URL is empty — not redirecting',
      )
    }
    return
  }

  // A primary origin that is itself listed as legacy would redirect to itself
  // forever. Serve the request instead of looping.
  let targetHost: string
  try {
    targetHost = normaliseHost(new URL(appUrl).host)
  }
  catch {
    return
  }
  if (targetHost === host) return

  // `event.path` is the raw request target, query string included.
  return sendRedirect(event, `${appUrl}${event.path}`, 308)
})
