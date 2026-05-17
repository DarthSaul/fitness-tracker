import * as Sentry from '@sentry/nuxt'

/**
 * Per-request Sentry isolation scope + belt-and-suspenders error capture.
 *
 * - Opens an isolation scope on the `request` hook so user/tag scoping written
 *   later (e.g. by `auth.ts` calling `Sentry.setUser`) stays bound to this
 *   request only — preventing cross-request leakage under concurrent load.
 * - Captures uncaught route errors on the `error` hook. `@sentry/nuxt` already
 *   wires this automatically, so this is a redundant safety net.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    Sentry.withIsolationScope((scope) => {
      event.context.sentryScope = scope
      scope.setTag('requestId', event.context.requestId)
    })
  })

  nitroApp.hooks.hook('error', (error, { event }) => {
    Sentry.captureException(error, {
      tags: {
        route: event?.path,
        requestId: event?.context.requestId,
      },
    })
  })
})
