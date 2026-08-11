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

/**
 * Baseline applied on every load. NUXT_PUBLIC_APP_URL is pinned to a valid
 * value because the config now *throws* on a bad one — without this, a CORS
 * rejection case would leak its env into whichever test loaded next.
 */
const BASE_ENV: Record<string, string | undefined> = {
  NUXT_PUBLIC_APP_URL: 'https://example.com/', // deliberately trailing-slashed
}

/** Re-imports the config with a fresh module registry so env changes apply. */
async function loadConfig(env: Record<string, string | undefined> = {}): Promise<NuxtConfig> {
  vi.resetModules()
  for (const [key, value] of Object.entries({ ...BASE_ENV, ...env })) vi.stubEnv(key, value)
  return (await import('./nuxt.config')).default as unknown as NuxtConfig
}

/** The header under test, or undefined if the rule ever loses it. */
function allowOrigin(c: NuxtConfig): string | undefined {
  return c.nitro.routeRules['/api/**']?.headers?.['Access-Control-Allow-Origin']
}

let config: NuxtConfig

beforeAll(async () => {
  vi.stubGlobal('defineNuxtConfig', (c: unknown) => c)
  config = await loadConfig()
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
    // Browsers compare origins exactly and an Origin header never has a
    // trailing slash, so `https://example.com/` can never match.
    expect(allowOrigin(config)).toBe('https://example.com')
    expect(allowOrigin(config)).not.toMatch(/\/$/)
  })

  test('allow-origin is never the wildcard', () => {
    expect(allowOrigin(config)).not.toBe('*')
  })

  test('a bare origin passes through unchanged', async () => {
    const fresh = await loadConfig({ NUXT_PUBLIC_APP_URL: 'https://example.com' })

    expect(allowOrigin(fresh)).toBe('https://example.com')
  })

  test('a non-default port is preserved', async () => {
    // Dropping the port would silently widen the origin to every port on the host.
    const fresh = await loadConfig({ NUXT_PUBLIC_APP_URL: 'http://localhost:3000/' })

    expect(allowOrigin(fresh)).toBe('http://localhost:3000')
  })

  test('an unset value yields no origin rather than failing the build', async () => {
    // Local and CI builds have no web origin and must still build.
    const fresh = await loadConfig({ NUXT_PUBLIC_APP_URL: undefined })

    expect(allowOrigin(fresh)).toBe('')
  })

  test('rejects the wildcard', async () => {
    // CLAUDE.md forbids `*` outright — it would let any site call the API with
    // the user's cookies. Fail the build rather than ship it.
    await expect(loadConfig({ NUXT_PUBLIC_APP_URL: '*' })).rejects.toThrow(/must not be "\*"/)
  })

  test('rejects a URL carrying a path', async () => {
    // Silently dropping the path would hide the misconfiguration; the message
    // names the origin the author almost certainly meant.
    await expect(loadConfig({ NUXT_PUBLIC_APP_URL: 'https://example.com/app' }))
      .rejects.toThrow(/bare origin with no path/)
  })

  test('rejects a value that is not an absolute URL', async () => {
    await expect(loadConfig({ NUXT_PUBLIC_APP_URL: 'fitness-app.me' }))
      .rejects.toThrow(/must be an absolute URL/)
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
