/**
 * Composable that wraps `nuxt-auth-utils` session state with app-level OAuth sign-in and sign-out actions.
 * @returns Session state (`loggedIn`, `user`, `session`, `fetch`) plus OAuth action helpers.
 */
export function useAuth() {
  const { loggedIn, user, session, fetch } = useUserSession()

  /** Redirects the browser to the Google OAuth initiation endpoint. */
  async function signInWithGoogle() {
    await navigateTo('/api/auth/google', { external: true })
  }

  /** Redirects the browser to the Apple OAuth initiation endpoint. */
  async function signInWithApple() {
    await navigateTo('/api/auth/apple', { external: true })
  }

  /** Clears the server session, refreshes local session state, and navigates to the login page. */
  async function signOut() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    await fetch()
    await navigateTo('/login')
  }

  return {
    loggedIn,
    user,
    session,
    fetch,
    signInWithGoogle,
    signInWithApple,
    signOut,
  }
}
