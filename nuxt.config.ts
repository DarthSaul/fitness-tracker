// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['nuxt-auth-utils', '@nuxt/ui', '@vite-pwa/nuxt'],
  css: ['~/assets/css/main.css'],
  colorMode: {
    preference: 'dark',
  },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
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
      start_url: '/app',
      scope: '/',
      id: '/app',
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
      navigateFallback: '/offline',
      globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      navigateFallbackDenylist: [/^\/api\//],
    },
  },
  nitro: {
    experimental: {
      openAPI: true,
    },
    openAPI: {
      route: '/_openapi.json',
      meta: {
        title: 'Workout Tracker API',
        description: 'REST API for tracking structured workout programs',
        version: '0.1.0',
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
