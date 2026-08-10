/**
 * Global route guard that redirects unauthenticated users away from protected routes and
 * bounces authenticated users away from the login page.
 *
 * Protected exact paths: `/`
 * Protected route prefixes: every authenticated area of the app. Anything
 * reachable from the tab bar or a settings row belongs here — `/settings` in
 * particular holds the profile and the sign-out action.
 */
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()

  const protectedExact = ['/']
  const protectedPrefixes = [
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
  const isProtected =
    protectedExact.includes(to.path) ||
    protectedPrefixes.some(prefix => to.path === prefix || to.path.startsWith(prefix + '/'))

  if (isProtected && !loggedIn.value) {
    return navigateTo('/login')
  }

  if (to.path === '/login' && loggedIn.value) {
    return navigateTo('/')
  }
})
