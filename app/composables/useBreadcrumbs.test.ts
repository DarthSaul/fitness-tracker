/**
 * Tests for app/composables/useBreadcrumbs.ts
 *
 * The map is keyed on the generated route *name* rather than the path prefix
 * because four screens hang off a parent that is not their prefix — and those
 * are exactly the cases a prefix implementation gets wrong, so they carry the
 * weight of this file.
 */
import { describe, test, expect } from 'vitest'
import { resolveBreadcrumbs } from './useBreadcrumbs'

describe('resolveBreadcrumbs', () => {
  describe('single-parent screens', () => {
    test.each([
      ['history-id', 'History', '/history'],
      ['history-standalone-id', 'History', '/history'],
      ['programs-id', 'Programs', '/programs'],
      ['feedback', 'Settings', '/settings'],
      ['pt-routines', 'Settings', '/settings'],
    ])('%s hangs off %s', (name, parentLabel, parentTo) => {
      expect(resolveBreadcrumbs(name, 'Leaf')).toEqual([
        { label: parentLabel, to: parentTo },
        { label: 'Leaf' },
      ])
    })
  })

  /**
   * The four screens a path-prefix scheme would misfile: `/program` and
   * `/standalone-workouts` are reached from Home, not from `/programs`, and
   * `/feedback` and `/pt-routines` are Settings rows with no shared prefix
   * at all.
   */
  describe('screens whose parent is not their path prefix', () => {
    test('program (Manage Program) hangs off Home, not Programs', () => {
      expect(resolveBreadcrumbs('program', 'Manage Program')).toEqual([
        { label: 'Home', to: '/home' },
        { label: 'Manage Program' },
      ])
    })

    test('standalone-workouts hangs off Home', () => {
      expect(resolveBreadcrumbs('standalone-workouts', 'Strength on the Go')).toEqual([
        { label: 'Home', to: '/home' },
        { label: 'Strength on the Go' },
      ])
    })
  })

  describe('two-parent chains', () => {
    test('a program day carries Home → Manage Program', () => {
      expect(resolveBreadcrumbs('program-week-week-day-day', 'Log Workout')).toEqual([
        { label: 'Home', to: '/home' },
        { label: 'Manage Program', to: '/program' },
        { label: 'Log Workout' },
      ])
    })

    test('a standalone workout carries Home → Strength on the Go', () => {
      expect(resolveBreadcrumbs('standalone-workouts-id', 'Full Body A')).toEqual([
        { label: 'Home', to: '/home' },
        { label: 'Strength on the Go', to: '/standalone-workouts' },
        { label: 'Full Body A' },
      ])
    })
  })

  describe('the leaf', () => {
    test('is the last crumb and carries no link', () => {
      const crumbs = resolveBreadcrumbs('history-id', 'Wed Jan 15')
      const leaf = crumbs.at(-1)

      expect(leaf).toEqual({ label: 'Wed Jan 15' })
      expect(leaf).not.toHaveProperty('to')
    })

    /**
     * Detail screens publish their real title through `usePageHeader()` once
     * the fetch lands, so the leaf label is whatever the shell is currently
     * showing — no separate plumbing.
     */
    test('reflects the title it was handed', () => {
      expect(resolveBreadcrumbs('standalone-workouts-id', 'Push Day').at(-1))
        .toEqual({ label: 'Push Day' })
    })
  })

  describe('falls back to no breadcrumb', () => {
    test('for an unmapped route name', () => {
      expect(resolveBreadcrumbs('some-future-screen', 'Whatever')).toEqual([])
    })

    // The shell renders a `← Back` button instead — better than a headless crumb.
    test('when the title has not resolved yet', () => {
      expect(resolveBreadcrumbs('history-id', undefined)).toEqual([])
      expect(resolveBreadcrumbs('history-id', '')).toEqual([])
    })

    test('when the route has no name', () => {
      expect(resolveBreadcrumbs(null, 'Leaf')).toEqual([])
      expect(resolveBreadcrumbs(undefined, 'Leaf')).toEqual([])
    })
  })

  test('never returns a chain shorter than parent + leaf', () => {
    for (const name of ['history-id', 'programs-id', 'feedback', 'program-week-week-day-day']) {
      expect(resolveBreadcrumbs(name, 'Leaf').length).toBeGreaterThanOrEqual(2)
    }
  })
})
