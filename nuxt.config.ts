// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
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
    // Pinned to dark until every screen has moved off the hardcoded
    // slate/violet classes; the token layer already defines both schemes.
    preference: 'dark',
  },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'Workout' },
        { name: 'theme-color', content: '#0f0a1e' },
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
      name: 'Workout Tracker',
      short_name: 'Workout',
      start_url: '/',
      scope: '/',
      id: '/',
      display: 'standalone',
      orientation: 'portrait',
      theme_color: '#0f0a1e',
      background_color: '#0f0a1e',
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
        {
          src: '/icons/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'maskable',
        },
        {
          src: '/icons/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      navigateFallback: '/',
      navigateFallbackDenylist: [/^\/api\//],
    },
  },
  nitro: {
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
    },
    experimental: {
      openAPI: true,
    },
    openAPI: {
      route: '/_openapi.json',
      meta: {
        title: 'Workout Tracker API',
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
