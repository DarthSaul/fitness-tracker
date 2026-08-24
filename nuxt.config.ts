import { version } from './package.json'

/**
 * Normalises NUXT_PUBLIC_APP_URL into a bare CORS origin.
 *
 * An `Origin` is scheme + host + port and nothing else, and the browser matches
 * it byte for byte. So a value carrying a path yields a header that can never
 * match, and `*` hands the API to every site on the internet — which CLAUDE.md
 * forbids outright. Both fail silently at runtime, surfacing only as a CORS
 * error in someone else's console, so reject them at build time instead.
 *
 * Empty stays legal: it is how a build with no configured web origin says
 * "no cross-origin caller", which is the correct local and CI default.
 */
function corsOrigin(raw: string | undefined): string {
  const value = (raw ?? '').trim()
  if (!value) return ''

  if (value === '*') {
    throw new Error(
      'NUXT_PUBLIC_APP_URL must not be "*" — that allows every origin to call the API. '
      + 'Set it to the deployment\'s own URL.',
    )
  }

  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    throw new Error(
      `NUXT_PUBLIC_APP_URL must be an absolute URL, got ${JSON.stringify(value)}.`,
    )
  }

  // Must precede the path check: `file:///` has a pathname of "/" and would
  // otherwise sail through, and its origin serialises to the *string* "null".
  // `Access-Control-Allow-Origin: null` is worse than a wrong origin — it
  // matches every opaque origin, sandboxed iframes and `data:` documents
  // included. Non-HTTP schemes are never a legitimate web origin here.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(
      `NUXT_PUBLIC_APP_URL must use http:// or https://, got ${JSON.stringify(value)}.`,
    )
  }

  // A lone "/" is the trailing slash people naturally type, and dropping it is
  // the whole point. Anything past it means the value is a page, not an origin.
  if ((url.pathname !== '' && url.pathname !== '/') || url.search || url.hash) {
    throw new Error(
      `NUXT_PUBLIC_APP_URL must be a bare origin with no path, got ${JSON.stringify(value)}. `
      + `Use "${url.origin}".`,
    )
  }

  return url.origin
}

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  // Enabled so the public landing page can be prerendered to real HTML. Every
  // app route is switched back off in `nitro.routeRules` below, so they keep
  // shipping exactly the SPA they did before. Nuxt itself models `ssr: false`
  // as `ssr: true` plus a `/**` route rule, so this is its own equivalence
  // rather than a new rendering mode.
  ssr: true,
  devtools: { enabled: true },
  modules: ['nuxt-auth-utils', '@nuxt/ui', '@vite-pwa/nuxt', '@sentry/nuxt/module'],
  sourcemap: {
    server: true,
    client: 'hidden',
  },
  sentry: {
    // Vercel serverless doesn't apply Node's --import flag, so the default
    // instrumentation never runs Sentry.init() at runtime. Inject the server
    // config as a top-level import instead so error capture works on Vercel.
    autoInjectServerSentry: 'top-level-import',
    sourceMapsUploadOptions: {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
    },
  },
  auth: {
    sessionCookie: {
      maxAge: 60 * 60 * 24 * 30, // 30 days
    },
  },
  runtimeConfig: {
    supabaseUrl: '',
    supabaseServiceRoleKey: '',
    jwtAccessSecret: '',
    jwtRefreshSecret: '',
    appleBundleId: '',
    oauthGoogleClientId: '',
    googleIosClientId: '',
    apnsTeamId: '',
    apnsKeyId: '',
    apnsPrivateKey: '',
    public: {
      // Surfaced on the Settings screen; single source of truth is package.json.
      appVersion: version,
      // Web Sign in with Apple needs a Services ID *and* the signing key the
      // native iOS flow doesn't use. All of these are required, so a partial
      // configuration fails just as hard as none at all — hide the button
      // unless every one is present.
      //
      // REDIRECT_URL counts even though nuxt-auth-utils documents it as
      // optional: it falls back to a derived URL when building the authorize
      // redirect, but sends `config.redirectURL` verbatim at the token
      // exchange with no fallback. Without it Apple returns `invalid_grant`
      // *after* the user has already consented, which is a far worse failure
      // than a hidden button.
      //
      // Overridable at runtime via NUXT_PUBLIC_APPLE_AUTH_ENABLED, so a
      // deployment can flip it without a rebuild. The default is computed from
      // the build environment.
      appleAuthEnabled: Boolean(
        process.env.NUXT_OAUTH_APPLE_CLIENT_ID
        && process.env.NUXT_OAUTH_APPLE_TEAM_ID
        && process.env.NUXT_OAUTH_APPLE_KEY_ID
        && process.env.NUXT_OAUTH_APPLE_PRIVATE_KEY
        && process.env.NUXT_OAUTH_APPLE_REDIRECT_URL,
      ),
      // Open Graph image and canonical URLs must be absolute for most crawlers.
      // The same env var already drives the API's CORS headers, read there via
      // process.env.
      //
      // NOTE: `/` is prerendered, so this value is baked into its static HTML
      // at BUILD time. Unlike the rest of runtimeConfig.public it cannot be
      // corrected by setting NUXT_PUBLIC_APP_URL at runtime — the deployment
      // must have it set in the build environment or the OG tags will point at
      // whatever the builder had.
      appUrl: process.env.NUXT_PUBLIC_APP_URL ?? '',
    },
  },
  components: [
    // iOS design-system primitives register as <AppCard>, <AppChip>, … so they
    // read distinctly from Nuxt UI's U-prefixed components.
    { path: '~/components/ios', prefix: 'App', pathPrefix: false },
    '~/components',
  ],
  css: ['~/assets/css/main.css'],
  ui: {
    // @nuxt/ui auto-registers @nuxt/fonts. The design system is 100% system
    // fonts (SF Pro on Apple platforms, system-ui elsewhere) to match the iOS
    // client, so the webfont pipeline is dead weight — and it can misfire
    // trying to resolve `-apple-system` as a downloadable family.
    fonts: false,
  },
  colorMode: {
    // Mirrors iOS `AppAppearance`: follow the system by default, with an
    // explicit override available in Settings.
    preference: 'system',
    fallback: 'dark',
    storageKey: 'appAppearance',
  },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      // Global defaults. The landing page overrides these with useSeoMeta; the
      // app screens are behind auth and never surface in a link preview.
      title: 'DR. DUMBBELL',
      titleTemplate: '%s · DR. DUMBBELL',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        {
          name: 'description',
          content: 'A workout tracker for people following a structured strength program — multi-week programs, set-by-set logging and strength trends per exercise.',
        },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'Dr. Dumbbell' },
        // Scoped per scheme so the browser chrome tracks systemBackground.
        // These follow the OS setting rather than the in-app override, which
        // is the most a static meta tag can do.
        { name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#000000', media: '(prefers-color-scheme: dark)' },
      ],
      link: [
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon-180.png' },
      ],
    },
  },
  pwa: {
    registerType: 'autoUpdate',
    client: {
      installPrompt: true,
    },
    manifest: {
      name: 'DR. DUMBBELL',
      short_name: 'Dr. Dumbbell',
      // An installed app opens straight into the dashboard, not the marketing
      // page. `scope` stays at the root because it must cover `/`, `/login` and
      // the OAuth callbacks; `id` stays because changing it mints a new app
      // identity and orphans every existing install.
      start_url: '/home',
      scope: '/',
      id: '/',
      display: 'standalone',
      // Matches the dark systemBackground. The manifest colours are static per
      // spec, so the light-scheme splash intentionally doesn't track them.
      theme_color: '#000000',
      background_color: '#000000',
      categories: ['fitness', 'health'],
      icons: [
        {
          src: '/icons/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/icons/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        // Separate art for maskable: the OS crops to the centre 80%, which
        // would otherwise cut the wordmark off the full-bleed icon.
        {
          src: '/icons/icon-192-maskable.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'maskable',
        },
        {
          src: '/icons/icon-512-maskable.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      // The SPA shell, not `/`. Now that `/` is a prerendered marketing page,
      // falling back to it would serve marketing HTML for every offline
      // navigation — /home, /history, /workout/x — against a browser URL of
      // something else, mismatching on hydration every time.
      navigateFallback: '/home',
      // `/` and `/privacy` have their own precache entries and must not be
      // replaced by the shell. Defensive: the precache route is registered
      // first regardless.
      navigateFallbackDenylist: [/^\/api\//, /^\/$/, /^\/privacy\/?$/],
      // The hero art is deliberately NOT in globPatterns: precaching ~400KB of
      // jpg into every install for two public pages is a bad trade. This gets
      // the same offline-after-first-visit behaviour at no install-time cost.
      runtimeCaching: [
        {
          urlPattern: /^\/img\/.*\.(?:jpe?g|png|webp)$/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'marketing-img',
            expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 30 },
          },
        },
      ],
    },
  },
  nitro: {
    prerender: {
      // The landing page links to /login and /home; crawling would prerender
      // and precache app routes that are deliberately client-rendered.
      crawlLinks: false,
    },
    routeRules: {
      '/api/**': {
        headers: {
          // Restrict CORS to the known web origin; native iOS apps don't send Origin headers
          // so these headers are a no-op for them. Never allow *.
          //
          // `corsOrigin` normalises and validates — see its comment for why a
          // path or a wildcard fails the build rather than shipping.
          'Access-Control-Allow-Origin': corsOrigin(process.env.NUXT_PUBLIC_APP_URL),
          'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Type',
          'Access-Control-Max-Age': '86400',
        },
      },

      // The public server-rendered routes: the marketing page and the privacy
      // policy. Both carry no auth state and no data fetching, baked at build
      // time and served statically. /privacy is the App Store's privacy policy
      // URL, so it must be real HTML without JavaScript.
      '/': { ssr: true, prerender: true },
      '/privacy': { ssr: true, prerender: true },

      // Prerendered SPA shell. Precached, and the service worker's navigation
      // fallback binds to it — every other route boots the client app here.
      '/home': { ssr: false, prerender: true },

      // Everything else stays exactly as it was: client-rendered.
      '/**': { ssr: false },
    },
    experimental: {
      openAPI: true,
    },
    openAPI: {
      route: '/_openapi.json',
      meta: {
        title: 'DR. DUMBBELL API',
        description: 'REST API for tracking structured workout programs',
        version: '0.2.0',
      },
      ui: {
        scalar: {
          route: '/api/docs',
          spec: {
            url: '/_openapi.json',
          },
        },
      },
    },
  },
  experimental: {
    // Off because `/home` is prerendered with `ssr: false`. Extraction writes
    // that route's payload to /home/_payload.json, where `data` serialises as
    // `undefined` — no SSR ran, so nothing populated it. On boot the client
    // merges that file into the payload with `Object.assign`, which copies
    // `undefined` values over the initialised `payload.data`, and the first
    // `useFetch` dies on `key in payload.data`. That is a 500 on every cold
    // load of the dashboard, which is exactly where OAuth drops you.
    //
    // Nothing here pays for extraction anyway: `/` and `/home` are the only
    // prerendered routes and both payloads are empty, so this also drops a
    // request from every cold load.
    payloadExtraction: false,
  },
})
