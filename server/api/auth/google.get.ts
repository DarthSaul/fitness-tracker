defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Google OAuth login',
    description: 'Initiates the Google OAuth authorization redirect. On successful callback, upserts the user and establishes a session, then redirects to /.',
    responses: {
      302: {
        description: 'Redirects to Google OAuth consent screen or to / after successful login',
      },
    },
  },
})

/**
 * Google OAuth handler — initiates the authorization redirect and processes the callback.
 * Requests `email` and `profile` scopes so profile name and avatar URL are available on every login.
 */
export default defineOAuthGoogleEventHandler({
  config: {
    scope: ['email', 'profile'],
  },
  /**
   * Upserts the authenticated user in the database and establishes a server session.
   * Profile fields (name, avatar) are refreshed on every login from the Google ID token.
   */
  async onSuccess(event, { user }) {
    try {
      const dbUser = await prisma.user.upsert({
        where: {
          provider_providerId: {
            provider: 'google',
            providerId: user.sub,
          },
        },
        update: {
          name: user.name ?? null,
          avatarUrl: user.picture ?? null,
          email: user.email,
        },
        create: {
          email: user.email,
          name: user.name ?? null,
          avatarUrl: user.picture ?? null,
          provider: 'google',
          providerId: user.sub,
        },
      })

      await setUserSession(event, {
        user: {
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          avatarUrl: dbUser.avatarUrl,
        },
      })

      return sendRedirect(event, '/')
    }
    catch (error) {
      console.error('Google OAuth upsert error:', error)
      return sendRedirect(event, '/login?error=upsert')
    }
  },
  /** Logs the error and redirects to the login page with a query-string error code. */
  onError(event, error) {
    console.error('Google OAuth error:', error)
    return sendRedirect(event, '/login?error=google_failed')
  },
})
