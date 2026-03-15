// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['nuxt-auth-utils'],
  nitro: {
    experimental: {
      openAPI: true,
    },
    openAPI: {
      meta: {
        title: 'Workout Tracker API',
        description: 'REST API for tracking structured workout programs',
        version: '0.1.0',
      },
      ui: {
        scalar: {
          route: '/api/docs',
        },
      },
    },
  },
})
