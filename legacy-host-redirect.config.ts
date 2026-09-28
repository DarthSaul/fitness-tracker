/**
 * Staged domain cutover: Vercel routes that 308 web traffic on a legacy host to
 * the same path on the primary origin (NUXT_PUBLIC_APP_URL), while `/api/**`
 * keeps being served in place.
 *
 * The API carve-out exists because the v1.0 iOS build has the legacy origin
 * baked into its API_BASE_URL. Once an iOS update carrying the new origin has
 * propagated, the legacy domain becomes a plain Vercel domain-level redirect
 * and this file is deleted, along with its test, its one use in nuxt.config.ts
 * and NUXT_LEGACY_HOSTS in .env.example.
 *
 * Why Vercel routes and not a Nitro middleware: `/`, `/privacy`, `/home` and
 * every file under `.output/public` are served by Vercel's `filesystem` phase
 * before the Nitro function is ever invoked, so a server middleware never sees
 * them. Routes merged into `nitro.vercel.config.routes` land ahead of that
 * phase and so cover prerendered pages and static assets too. The trade-off is
 * that both inputs are read at BUILD time — changing either needs a redeploy,
 * which `appUrl` already did (it is baked into the prerendered pages).
 *
 * Only GET and HEAD are redirected: a 308 preserves the method and body, but a
 * browser will not replay a cross-origin POST with the legacy host's cookies,
 * so redirecting a write would just fail differently. Vercel appends the
 * request's query string to a redirect's Location, as it does for vercel.json
 * `redirects`, which compile to this same route shape.
 */

/** One Build Output API v3 route: a host-conditional permanent redirect. */
export interface LegacyHostRedirectRoute {
  src: string
  has: [{ type: 'host', value: string }]
  methods: ['GET', 'HEAD']
  status: 308
  headers: { Location: string }
}

/** Lowercased hostname with any scheme, path or `:port` removed. */
function normaliseHost(raw: string): string {
  return raw.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/:].*$/, '')
}

/**
 * Builds the redirect routes from NUXT_LEGACY_HOSTS (comma-separated) and
 * NUXT_PUBLIC_APP_URL. Returns `[]` — a no-op — when no legacy host is set,
 * which is the correct local and CI default, and when the target is missing
 * or unusable, since serving the legacy host beats breaking it.
 */
export function legacyHostRedirectRoutes(
  legacyHostsRaw: string | undefined,
  appUrlRaw: string | undefined,
  warn: (message: string) => void = console.warn,
): LegacyHostRedirectRoute[] {
  const legacyHosts = [...new Set((legacyHostsRaw ?? '').split(',').map(normaliseHost).filter(Boolean))]
  if (legacyHosts.length === 0) return []

  const appUrl = (appUrlRaw ?? '').trim().replace(/\/+$/, '')
  let targetHost: string
  try {
    targetHost = new URL(appUrl).host.toLowerCase()
  }
  catch {
    warn(
      `NUXT_LEGACY_HOSTS is set (${legacyHosts.join(', ')}) but NUXT_PUBLIC_APP_URL `
      + `${appUrl ? `is not a URL (${JSON.stringify(appUrl)})` : 'is empty'} — legacy hosts will not redirect.`,
    )
    return []
  }

  return legacyHosts
    // A primary origin that is itself listed as legacy would redirect to
    // itself forever. Serve it instead of looping.
    .filter(host => host !== targetHost)
    .map(host => ({
      src: '^/(?!api/)(.*)$',
      has: [{ type: 'host', value: host }],
      methods: ['GET', 'HEAD'],
      status: 308,
      headers: { Location: `${appUrl}/$1` },
    }))
}
