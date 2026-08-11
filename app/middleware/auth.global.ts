/**
 * Global route guard that redirects unauthenticated users away from protected
 * routes and sends authenticated ones past the public pages into the app.
 *
 * `/` is the public marketing page; the dashboard is `/home`.
 *
 * Protected route prefixes: every authenticated area of the app. Anything
 * reachable from the nav or a settings row belongs here — `/settings` in
 * particular holds the profile and the sign-out action.
 */
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()

  const protectedPrefixes = [
    '/home',
    '/programs',
    '/program',
    '/workout',
    '/analytics',
    '/feedback',
    '/history',
    '/settings',
    '/pt-routines',
    '/standalone-workouts',
  ]
  const isProtected = protectedPrefixes.some(
    prefix => to.path === prefix || to.path.startsWith(prefix + '/'),
  )

  if (isProtected && !loggedIn.value) {
    return navigateTo('/login')
  }

  // Signed-in users have no use for the marketing page or the sign-in form.
  //
  // On a prerendered `/`, nuxt-auth-utils defers its session fetch to
  // `app:mounted`, which runs after this guard — so a signed-in user arriving
  // cold still sees the landing page for one round trip. `app/pages/index.vue`
  // carries a session-aware redirect for that case; this covers client-side
  // navigations, where the session is already resolved.
  if ((to.path === '/' || to.path === '/login') && loggedIn.value) {
    return navigateTo('/home')
  }
})
