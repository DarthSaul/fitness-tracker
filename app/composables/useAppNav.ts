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
  { label: 'Home', icon: 'i-lucide-house', to: '/home' },
  { label: 'History', icon: 'i-lucide-history', to: '/history' },
  { label: 'Analytics', icon: 'i-lucide-trending-up', to: '/analytics' },
  { label: 'Programs', icon: 'i-lucide-dumbbell', to: '/programs' },
  { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' },
]

/**
 * Whether `to` owns the screen currently at `path`.
 *
 * Every tab owns its own route and anything nested under it, stopping at a path
 * boundary so `/programs` does not swallow `/programslist` — or, more to the
 * point, `/program`, which is a different screen.
 *
 * Home needed an exact-match special case while it lived at `/`, since `/` is a
 * prefix of every route. At `/home` it is an ordinary prefix like the rest.
 *
 * Screens reached from a tab root but living outside its path — `/program`,
 * `/standalone-workouts`, `/feedback`, `/pt-routines` — deliberately light
 * nothing. The breadcrumb is what orients the user there.
 */
export function isNavItemActive(to: string, path: string): boolean {
  return path === to || path.startsWith(`${to}/`)
}
