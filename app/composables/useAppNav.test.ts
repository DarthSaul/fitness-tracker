/**
 * Tests for app/composables/useAppNav.ts
 *
 * The nav model is shared by the mobile tab bar and the desktop side rail, so
 * these assertions are what stops the two drifting apart. The active-state
 * rules matter more than they look: Home is matched exactly (a prefix match
 * would light it on every route), every other tab owns its nested detail
 * screens, and four routes deliberately light nothing at all.
 */
import { describe, test, expect } from 'vitest'
import { APP_NAV_ITEMS, isNavItemActive } from './useAppNav'

describe('APP_NAV_ITEMS', () => {
  test('is the five-item tab set, in order', () => {
    expect(APP_NAV_ITEMS.map(item => item.label)).toEqual([
      'Home',
      'History',
      'Analytics',
      'Programs',
      'Settings',
    ])
  })

  // Home moves to /home when the dashboard vacates `/` for the landing page.
  test('points at the five tab roots', () => {
    expect(APP_NAV_ITEMS.map(item => item.to)).toEqual([
      '/',
      '/history',
      '/analytics',
      '/programs',
      '/settings',
    ])
  })

  test('every item has a route and an icon', () => {
    for (const item of APP_NAV_ITEMS) {
      expect(item.to).toMatch(/^\//)
      expect(item.icon).toMatch(/^i-lucide-/)
    }
  })

  test('routes are unique', () => {
    const routes = APP_NAV_ITEMS.map(item => item.to)
    expect(new Set(routes).size).toBe(routes.length)
  })
})

describe('isNavItemActive', () => {
  test('matches a tab on its own route', () => {
    expect(isNavItemActive('/history', '/history')).toBe(true)
  })

  test('a tab owns its nested detail screens', () => {
    expect(isNavItemActive('/history', '/history/abc')).toBe(true)
    expect(isNavItemActive('/history', '/history/standalone/abc')).toBe(true)
    expect(isNavItemActive('/programs', '/programs/clprog001')).toBe(true)
  })

  test('does not match a sibling tab', () => {
    expect(isNavItemActive('/history', '/analytics')).toBe(false)
  })

  /**
   * `/programs` must not swallow `/programslist`, and — the case that actually
   * bites here — `/program` (Manage Program) is a different screen from
   * `/programs` (the library).
   */
  test('respects the path boundary', () => {
    expect(isNavItemActive('/history', '/historyfoo')).toBe(false)
    expect(isNavItemActive('/programs', '/programslist')).toBe(false)
    expect(isNavItemActive('/programs', '/program')).toBe(false)
  })

  test('Home is matched exactly, not as a prefix', () => {
    const home = APP_NAV_ITEMS[0]!.to

    expect(isNavItemActive(home, home)).toBe(true)
    expect(isNavItemActive(home, '/history')).toBe(false)
    expect(isNavItemActive(home, '/analytics')).toBe(false)
  })

  /**
   * These four screens hang off a tab root but are not under its path, so no
   * tab lights up on them. That is today's behaviour and it is deliberate —
   * the breadcrumb, not the nav highlight, is what orients the user there.
   */
  test.each(['/program', '/standalone-workouts', '/feedback', '/pt-routines'])(
    'no nav item is active on %s',
    (path) => {
      const active = APP_NAV_ITEMS.filter(item => isNavItemActive(item.to, path))
      expect(active).toEqual([])
    },
  )

  test('exactly one nav item is active on a nested detail screen', () => {
    const active = APP_NAV_ITEMS.filter(item => isNavItemActive(item.to, '/history/abc'))
    expect(active.map(item => item.label)).toEqual(['History'])
  })
})
