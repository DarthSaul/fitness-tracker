/**
 * Tests for legacy-host-redirect.config.ts
 *
 * Coverage strategy:
 *  - a legacy host yields one GET/HEAD 308 route whose `src` excludes /api/**
 *    and whose Location carries the captured path to appUrl
 *  - the route regex, run the way Vercel runs it (PCRE on the pathname), sends
 *    pages and prerendered assets to the right place and leaves the API alone
 *  - empty legacy hosts, empty or invalid appUrl and a self-listed primary
 *    host all produce no routes, and never throw
 */
import { describe, test, expect, vi } from 'vitest'
import { legacyHostRedirectRoutes } from './legacy-host-redirect.config'

/** Applies a route to a pathname as Vercel would: match `src`, substitute `$1`. */
function locationFor(route: { src: string, headers: { Location: string } }, pathname: string): string | null {
  const match = new RegExp(route.src).exec(pathname)
  return match ? route.headers.Location.replace('$1', match[1] ?? '') : null
}

describe('legacyHostRedirectRoutes', () => {
  test('builds a host-conditional GET/HEAD 308 to appUrl', () => {
    expect(legacyHostRedirectRoutes('fitness-app.me', 'https://drdumbbell.app')).toEqual([
      {
        src: '^/(?!api/)(.*)$',
        has: [{ type: 'host', value: 'fitness-app.me' }],
        methods: ['GET', 'HEAD'],
        status: 308,
        headers: { Location: 'https://drdumbbell.app/$1' },
      },
    ])
  })

  test('redirects pages, prerendered routes and static assets to the same path', () => {
    const [route] = legacyHostRedirectRoutes('fitness-app.me', 'https://drdumbbell.app')
    expect(locationFor(route!, '/')).toBe('https://drdumbbell.app/')
    expect(locationFor(route!, '/home')).toBe('https://drdumbbell.app/home')
    expect(locationFor(route!, '/privacy')).toBe('https://drdumbbell.app/privacy')
    expect(locationFor(route!, '/_nuxt/entry.abc123.js')).toBe('https://drdumbbell.app/_nuxt/entry.abc123.js')
    expect(locationFor(route!, '/auth/confirm')).toBe('https://drdumbbell.app/auth/confirm')
  })

  test('leaves /api/** on the legacy host alone', () => {
    const [route] = legacyHostRedirectRoutes('fitness-app.me', 'https://drdumbbell.app')
    expect(locationFor(route!, '/api/programs')).toBeNull()
    expect(locationFor(route!, '/api/health')).toBeNull()
    expect(locationFor(route!, '/api/auth/apple')).toBeNull()
  })

  test('emits one route per host in a comma-separated list, normalised and deduplicated', () => {
    const routes = legacyHostRedirectRoutes(' Fitness-App.me , old.example:443,fitness-app.me,', 'https://drdumbbell.app')
    expect(routes.map(r => r.has[0].value)).toEqual(['fitness-app.me', 'old.example'])
  })

  test('drops a trailing slash on appUrl so the path is not doubled', () => {
    const [route] = legacyHostRedirectRoutes('fitness-app.me', 'https://drdumbbell.app/')
    expect(route!.headers.Location).toBe('https://drdumbbell.app/$1')
  })

  test('is a no-op when no legacy host is set', () => {
    const warn = vi.fn()
    expect(legacyHostRedirectRoutes(undefined, 'https://drdumbbell.app', warn)).toEqual([])
    expect(legacyHostRedirectRoutes('', 'https://drdumbbell.app', warn)).toEqual([])
    expect(legacyHostRedirectRoutes(' , ', 'https://drdumbbell.app', warn)).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  test('emits nothing and warns when appUrl is empty', () => {
    const warn = vi.fn()
    expect(legacyHostRedirectRoutes('fitness-app.me', '', warn)).toEqual([])
    expect(legacyHostRedirectRoutes('fitness-app.me', undefined, warn)).toEqual([])
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls[0]![0]).toContain('is empty')
  })

  test('emits nothing and warns when appUrl is not a URL', () => {
    const warn = vi.fn()
    expect(legacyHostRedirectRoutes('fitness-app.me', 'not a url', warn)).toEqual([])
    expect(warn.mock.calls[0]![0]).toContain('is not a URL')
  })

  test('never redirects the primary host to itself', () => {
    expect(legacyHostRedirectRoutes('drdumbbell.app', 'https://drdumbbell.app', vi.fn())).toEqual([])
  })
})
