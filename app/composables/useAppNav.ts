/**
 * The app's primary navigation model, shared by the mobile tab bar and the
 * desktop side rail so the two cannot drift apart.
 *
 * Mirrors the five tabs of `RootTabView` on iOS.
 */
export type NavItem = {
  label: string
  /** Lucide icon name, e.g. `i-lucide-house`. */
  icon: string
  to: string
}

export const APP_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Home', icon: 'i-lucide-house', to: '/' },
  { label: 'History', icon: 'i-lucide-history', to: '/history' },
  { label: 'Analytics', icon: 'i-lucide-trending-up', to: '/analytics' },
  { label: 'Programs', icon: 'i-lucide-dumbbell', to: '/programs' },
  { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' },
]

/**
 * Whether `to` owns the screen currently at `path`.
 *
 * Home is matched exactly — with five tabs a prefix match would light it up on
 * every route. Every other tab also owns its nested detail screens, but stops
 * at a path boundary so `/programs` does not swallow `/programslist` (or, more
 * to the point, `/program`).
 *
 * Screens reached from a tab root but living outside its path — `/program`,
 * `/standalone-workouts`, `/feedback`, `/pt-routines` — deliberately light
 * nothing. The breadcrumb is what orients the user there.
 */
export function isNavItemActive(to: string, path: string): boolean {
  if (to === '/') return path === '/'
  return path === to || path.startsWith(`${to}/`)
}
