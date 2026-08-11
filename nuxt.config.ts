import { version } from './package.json'

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
      // native iOS flow doesn't use. All four are required to mint the client
      // secret, so a partial configuration fails just as hard as none at all —
      // hide the button unless every one is present.
      //
      // Empty string rather than `false`: this is overridable at runtime via
      // NUXT_PUBLIC_APPLE_AUTH_ENABLED, so the deployment can flip it without
      // a rebuild. The default is computed from the build environment.
      appleAuthEnabled: Boolean(
        process.env.NUXT_OAUTH_APPLE_CLIENT_ID
        && process.env.NUXT_OAUTH_APPLE_TEAM_ID
        && process.env.NUXT_OAUTH_APPLE_KEY_ID
        && process.env.NUXT_OAUTH_APPLE_PRIVATE_KEY,
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
      // `/` has its own precache entry and must not be replaced by the shell.
      // Defensive: the precache route is registered first regardless.
      navigateFallbackDenylist: [/^\/api\//, /^\/$/],
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
          'Access-Control-Allow-Origin': process.env.NUXT_PUBLIC_APP_URL ?? '',
          'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Type',
          'Access-Control-Max-Age': '86400',
        },
      },

      // The only server-rendered route: a public marketing page with no auth
      // state and no data fetching, baked at build time and served statically.
      '/': { ssr: true, prerender: true },

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
})
