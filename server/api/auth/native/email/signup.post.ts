defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Native email sign-up',
    description: 'Creates a new account via Supabase Auth with email and password. When email confirmation is required, no tokens are issued — the client should prompt the user to confirm, then sign in.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email', 'password'],
            properties: {
              email: { type: 'string', format: 'email' },
              password: { type: 'string' },
              name: { type: 'string' },
            },
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Account created. Tokens are present only when confirmationRequired is false.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['confirmationRequired'],
              properties: {
                confirmationRequired: { type: 'boolean' },
                accessToken: { type: 'string' },
                refreshToken: { type: 'string' },
              },
            },
          },
        },
      },
      400: { description: 'Validation error or sign-up failed' },
      429: { description: 'Too many requests' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  await rateLimitByIp(event)

  const body = await readBody<{ email?: string, password?: string, name?: string }>(event)

  if (!body?.email || !body.password) {
    throw createError({ statusCode: 400, statusMessage: 'Email and password are required.' })
  }

  if (body.password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'Password must be at least 8 characters.' })
  }

  // Without an explicit redirect, confirmation links fall back to the Supabase
  // dashboard Site URL and dump users on the site root. iOS has no deep links
  // yet, so confirmations route through the web /auth/confirm page (same as
  // web signup); the user then returns to the app and signs in. The URL must
  // be in the Supabase redirect allowlist for each environment.
  const config = useRuntimeConfig()
  const { data, error } = await supabase.auth.signUp({
    email: body.email,
    password: body.password,
    options: {
      emailRedirectTo: `${config.public.appUrl}/auth/confirm`,
    },
  })

  if (error) {
    throw createError({ statusCode: 400, statusMessage: error.message })
  }

  if (!data.user) {
    throw createError({ statusCode: 400, statusMessage: 'Sign-up failed. Please try again.' })
  }

  // If email confirmation is required, Supabase returns a user with identities = []
  // for an address that already has a confirmed account
  if (data.user.identities?.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'An account with this email already exists.' })
  }

  // Confirmation pending: no session yet. Do NOT create the User/Identity row —
  // findOrLinkUser auto-links by email and must only run once Supabase has
  // verified the address (see the SAFETY note in server/utils/auth.ts). The
  // row is created on the first post-confirmation sign-in instead.
  if (!data.session) {
    return { confirmationRequired: true }
  }

  try {
    const user = await findOrLinkUser({
      provider: 'email',
      providerId: data.user.id,
      email: body.email,
      name: body.name ?? undefined,
    })

    const tokens = await issueTokenPair(event, user.id)
    return { confirmationRequired: false, ...tokens }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/auth/native/email/signup' }, '[POST /api/auth/native/email/signup] Failed')
    throw createError({ statusCode: 500, statusMessage: 'Account setup failed. Please try again.' })
  }
})
