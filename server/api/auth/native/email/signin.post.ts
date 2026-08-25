defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Native email sign-in',
    description: 'Authenticates with email and password via Supabase Auth and returns JWT access/refresh tokens for native clients.',
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
            },
          },
        },
      },
    },
    responses: {
      200: { description: 'JWT access and refresh tokens', content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenResponse' } } } },
      400: { description: 'Email and password are required' },
      401: { description: 'Invalid credentials, or email not yet confirmed' },
      429: { description: 'Too many requests' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  await rateLimitByIp(event)

  const body = await readBody<{ email?: string, password?: string }>(event)

  if (!body?.email || !body.password) {
    throw createError({ statusCode: 400, statusMessage: 'Email and password are required.' })
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: body.email,
    password: body.password,
  })

  if (error) {
    // GoTrue only reports email_not_confirmed after the password verified, so
    // surfacing it leaks nothing to a guesser — and without it an unconfirmed
    // user would see a misleading credentials error. 401 (not 403) so it stays
    // filtered out of Sentry.
    if ((error as { code?: string }).code === 'email_not_confirmed') {
      throw createError({
        statusCode: 401,
        statusMessage: 'Please confirm your email before signing in.',
        data: { code: 'email_not_confirmed' },
      })
    }
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password.' })
  }

  try {
    // No `name`: passing one on every sign-in would overwrite a user-edited
    // name via findOrLinkUser's profile refresh.
    const user = await findOrLinkUser({
      provider: 'email',
      providerId: data.user.id,
      email: data.user.email!,
    })

    return await issueTokenPair(event, user.id)
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/auth/native/email/signin' }, '[POST /api/auth/native/email/signin] Failed')
    throw createError({ statusCode: 500, statusMessage: 'Sign-in failed. Please try again.' })
  }
})
