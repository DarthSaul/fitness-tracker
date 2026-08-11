/**
 * Breadcrumb trail for the desktop shell, which replaces the phone's `< Back`
 * bar on pushed screens.
 *
 * Keyed on the generated route *name* rather than the path prefix, because
 * four screens hang off a parent that is not their prefix: `/program` and
 * `/standalone-workouts` are reached from Home, and `/feedback` and
 * `/pt-routines` are Settings rows. A prefix scheme would need a special-case
 * table for those anyway, at which point the name map is that table.
 */
export type Crumb = {
  label: string
  /** Omitted on the leaf, which is the current page and so is not a link. */
  to?: string
}

const PARENTS: Record<string, Crumb[]> = {
  'history-id': [{ label: 'History', to: '/history' }],
  'history-standalone-id': [{ label: 'History', to: '/history' }],
  'programs-id': [{ label: 'Programs', to: '/programs' }],
  'program': [{ label: 'Home', to: '/' }],
  'program-week-week-day-day': [
    { label: 'Home', to: '/' },
    { label: 'Manage Program', to: '/program' },
  ],
  'standalone-workouts': [{ label: 'Home', to: '/' }],
  'standalone-workouts-id': [
    { label: 'Home', to: '/' },
    { label: 'Strength on the Go', to: '/standalone-workouts' },
  ],
  'feedback': [{ label: 'Settings', to: '/settings' }],
  'pt-routines': [{ label: 'Settings', to: '/settings' }],
  'style-guide': [{ label: 'Settings', to: '/settings' }],
}

/**
 * Builds the trail for a screen, or an empty array when there is nothing
 * meaningful to show — an unmapped route, or a detail screen whose title has
 * not arrived yet. The shell falls back to a `← Back` button in that case
 * rather than rendering a headless crumb.
 *
 * `leafTitle` is whatever header the shell is already displaying, so titles
 * published through `usePageHeader()` once a fetch lands flow in for free.
 */
export function resolveBreadcrumbs(
  routeName: string | null | undefined,
  leafTitle: string | undefined,
): Crumb[] {
  if (!routeName || !leafTitle) return []

  const parents = PARENTS[routeName]
  if (!parents) return []

  return [...parents, { label: leafTitle }]
}
