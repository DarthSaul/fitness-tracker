defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Apple OAuth login',
    description: 'Handles Apple OAuth flow (GET redirect + POST callback via form_post). On success, upserts the user and establishes a session, then redirects to /app.',
    responses: {
      302: {
        description: 'Redirects to Apple OAuth consent screen or to /app after successful login',
      },
    },
  },
})

/**
 * Apple OAuth handler — covers both the GET redirect initiation and the POST callback.
 * Apple uses `response_mode: form_post`, so this file has no HTTP method suffix.
 */
export default defineOAuthAppleEventHandler({
  config: {
    scope: ['name', 'email'],
  },
  /**
   * Upserts the authenticated user in the database and establishes a server session.
   * Name is only populated on the first login; email is read from the JWT payload on every login.
   */
  async onSuccess(event, { user, payload }) {
    // Apple only sends name on the very first login (from POST body).
    // Email is available from the JWT payload on every login.
    const email = payload.email ?? user.email
    if (!email) {
      return sendRedirect(event, '/login?error=apple_no_email')
    }

    const firstName = user.name?.firstName
    const lastName = user.name?.lastName
    const name = [firstName, lastName].filter(Boolean).join(' ') || null

    try {
      const dbUser = await prisma.user.upsert({
        where: {
          provider_providerId: {
            provider: 'apple',
            providerId: payload.sub,
          },
        },
        update: {
          email,
          // Only overwrite name when Apple provides it (first login only)
          ...(name ? { name } : {}),
        },
        create: {
          email,
          name,
          avatarUrl: null,
          provider: 'apple',
          providerId: payload.sub,
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

      return sendRedirect(event, '/app')
    }
    catch (error) {
      console.error('Apple OAuth upsert error:', error)
      return sendRedirect(event, '/login?error=apple_failed')
    }
  },
  /** Logs the error and redirects to the login page with a query-string error code. */
  onError(event, error) {
    console.error('Apple OAuth error:', error)
    return sendRedirect(event, '/login?error=apple_failed')
  },
})
