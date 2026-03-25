/**
 * Global route guard that redirects unauthenticated users away from protected routes and
 * bounces authenticated users away from the login page.
 *
 * Protected exact paths: `/`
 * Protected route prefixes: `/programs`, `/program`, `/workout`, `/analytics`, `/feedback`.
 */
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()

  const protectedExact = ['/']
  const protectedPrefixes = ['/programs', '/program', '/workout', '/analytics', '/feedback']
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
