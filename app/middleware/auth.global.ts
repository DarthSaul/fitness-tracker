/**
 * Global route guard that redirects unauthenticated users away from protected routes and
 * bounces authenticated users away from the login page.
 *
 * Protected route prefixes: `/app`, `/programs`, `/program`, `/workout`, `/analytics`.
 */
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()

  if (to.path === '/') {
    return navigateTo(loggedIn.value ? '/app' : '/login')
  }

  const protectedPrefixes = ['/app', '/programs', '/program', '/workout', '/analytics']
  const isProtected = protectedPrefixes.some(
    prefix => to.path === prefix || to.path.startsWith(prefix + '/')
  )
  if (isProtected && !loggedIn.value) {
    return navigateTo('/login')
  }

  if (to.path === '/login' && loggedIn.value) {
    return navigateTo('/app')
  }
})
