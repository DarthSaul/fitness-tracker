export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()

  if (to.path === '/') {
    return navigateTo(loggedIn.value ? '/app' : '/login')
  }

  if (to.path.startsWith('/app') && !loggedIn.value) {
    return navigateTo('/login')
  }

  if (to.path === '/login' && loggedIn.value) {
    return navigateTo('/app')
  }
})
