// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['nuxt-auth-utils', '@nuxt/ui', '@vite-pwa/nuxt'],
  runtimeConfig: {
    supabaseUrl: '',
    supabaseAnonKey: '',
  },
  css: ['~/assets/css/main.css'],
  colorMode: {
    preference: 'dark',
  },
  pwa: {
    manifest: {
      name: 'Workout Tracker',
      short_name: 'Workout',
      start_url: '/app',
      display: 'standalone',
      orientation: 'portrait',
      theme_color: '#0f0a1e',
      background_color: '#0f0a1e',
      icons: [
        {
          src: '/icons/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: '/icons/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
        },
      ],
    },
    workbox: {
      navigateFallback: undefined,
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
