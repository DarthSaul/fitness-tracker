/**
 * Composable that wraps `nuxt-auth-utils` session state with app-level sign-in and sign-out actions.
 * Supports Google OAuth and email/password authentication via Supabase Auth.
 * @returns Session state (`loggedIn`, `user`, `session`, `fetch`) plus auth action helpers.
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

  /** Signs up with email and password via Supabase Auth. Returns whether email confirmation is needed. */
  async function signUpWithEmail(email: string, password: string, name?: string) {
    const result = await $fetch('/api/auth/email/signup', {
      method: 'POST',
      body: { email, password, name },
    })

    if (!result.confirmationRequired) {
      await fetch()
    }

    return result
  }

  /** Signs in with email and password via Supabase Auth. */
  async function signInWithEmail(email: string, password: string) {
    await $fetch('/api/auth/email/signin', {
      method: 'POST',
      body: { email, password },
    })

    await fetch()
  }

  /** Sends a password reset email via Supabase Auth. */
  async function resetPassword(email: string) {
    await $fetch('/api/auth/email/reset-password', {
      method: 'POST',
      body: { email },
    })
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
    signUpWithEmail,
    signInWithEmail,
    resetPassword,
    signOut,
  }
}
