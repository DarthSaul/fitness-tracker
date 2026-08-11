/**
 * Tests for nuxt.config.ts — the two settings that are load-bearing for the
 * signed-in boot path and easy to regress silently, because neither shows up
 * until a real build is served.
 *
 * Coverage strategy:
 *  - payload extraction stays off for as long as any route is prerendered
 *    without SSR (the /home 500)
 *  - the CORS origin is normalised regardless of how NUXT_PUBLIC_APP_URL is
 *    entered in the deployment environment
 *
 * `nuxt.config.ts` calls the auto-imported `defineNuxtConfig` as a bare global
 * and reads `process.env` at module scope, so both are stubbed before a dynamic
 * import rather than importing at the top of the file.
 */
import { describe, test, expect, vi, beforeAll, afterAll } from 'vitest'

type RouteRule = { ssr?: boolean, prerender?: boolean, headers?: Record<string, string> }

type NuxtConfig = {
  experimental?: { payloadExtraction?: boolean }
  runtimeConfig: { public: { appleAuthEnabled: boolean } }
  nitro: { routeRules: Record<string, RouteRule> }
}

const APPLE_ENV = [
  'NUXT_OAUTH_APPLE_CLIENT_ID',
  'NUXT_OAUTH_APPLE_TEAM_ID',
  'NUXT_OAUTH_APPLE_KEY_ID',
  'NUXT_OAUTH_APPLE_PRIVATE_KEY',
  'NUXT_OAUTH_APPLE_REDIRECT_URL',
] as const

/** Re-imports the config with a fresh module registry so env changes apply. */
async function loadConfig(env: Record<string, string | undefined>): Promise<NuxtConfig> {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  return (await import('./nuxt.config')).default as unknown as NuxtConfig
}

let config: NuxtConfig

beforeAll(async () => {
  vi.stubGlobal('defineNuxtConfig', (c: unknown) => c)
  // Deliberately trailing-slashed: this is exactly how the value was entered in
  // Vercel, and the config is expected to normalise it rather than trust it.
  vi.stubEnv('NUXT_PUBLIC_APP_URL', 'https://example.com/')

  config = (await import('./nuxt.config')).default as unknown as NuxtConfig
})

afterAll(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('payload extraction', () => {
  test('at least one route is prerendered without SSR', () => {
    // Guard for the guard below: if this ever stops being true the
    // payloadExtraction assertion has no reason to exist and can be revisited.
    const spaPrerendered = Object.entries(config.nitro.routeRules).filter(
      ([, rule]) => rule.prerender === true && rule.ssr === false,
    )

    expect(spaPrerendered.map(([path]) => path)).toContain('/home')
  })

  test('is disabled, so a prerendered SPA route cannot ship a null payload', () => {
    // Prerendering `ssr: false` extracts the payload to _payload.json with
    // `data` serialised as undefined. The client merges that file over
    // payload.data with Object.assign — which copies undefined values — and the
    // first useFetch then throws on `key in payload.data`, 500ing the page.
    expect(config.experimental?.payloadExtraction).toBe(false)
  })
})

describe('API CORS headers', () => {
  test('allow-origin carries no trailing slash', () => {
    const origin = config.nitro.routeRules['/api/**']?.headers?.[
      'Access-Control-Allow-Origin'
    ]

    // Browsers compare origins exactly and an Origin header never has a
    // trailing slash, so `https://example.com/` can never match.
    expect(origin).toBe('https://example.com')
    expect(origin).not.toMatch(/\/$/)
  })

  test('allow-origin is never the wildcard', () => {
    const origin = config.nitro.routeRules['/api/**']?.headers?.[
      'Access-Control-Allow-Origin'
    ]

    expect(origin).not.toBe('*')
  })
})

describe('appleAuthEnabled', () => {
  test('is true only when every Apple credential is present', async () => {
    const fresh = await loadConfig(Object.fromEntries(APPLE_ENV.map(k => [k, 'set'])))

    expect(fresh.runtimeConfig.public.appleAuthEnabled).toBe(true)
  })

  test.each(APPLE_ENV)('is false when %s is missing', async (missing) => {
    // A partial configuration cannot mint the client secret or complete the
    // token exchange, so the login screen must keep the button hidden rather
    // than fail after the user has already consented at Apple.
    const fresh = await loadConfig(
      Object.fromEntries(APPLE_ENV.map(k => [k, k === missing ? undefined : 'set'])),
    )

    expect(fresh.runtimeConfig.public.appleAuthEnabled).toBe(false)
  })
})
