defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Email sign-up',
    description: 'Creates a new account via Supabase Auth with email and password, upserts the user in the database, and establishes a session.',
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
      200: { description: 'Account created. confirmationRequired is true when email confirmation is needed before session is active.', content: { 'application/json': { schema: { type: 'object', required: ['confirmationRequired'], properties: { confirmationRequired: { type: 'boolean', example: false } } } } } },
      400: { description: 'Validation error or sign-up failed' },
      429: { description: 'Too many requests' },
    },
  },
})

export default defineEventHandler(async (event) => {
  await rateLimitByIp(event)

  const body = await readBody<{ email?: string, password?: string, name?: string }>(event)

  if (!body.email || !body.password) {
    throw createError({ statusCode: 400, statusMessage: 'Email and password are required.' })
  }

  if (body.password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'Password must be at least 8 characters.' })
  }

  const { data, error } = await supabase.auth.signUp({
    email: body.email,
    password: body.password,
  })

  if (error) {
    throw createError({ statusCode: 400, statusMessage: error.message })
  }

  if (!data.user) {
    throw createError({ statusCode: 400, statusMessage: 'Sign-up failed. Please try again.' })
  }

  // If email confirmation is required, Supabase returns a user with identities = []
  if (data.user.identities?.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'An account with this email already exists.' })
  }

  const needsConfirmation = !data.session
  if (needsConfirmation) {
    return { confirmationRequired: true }
  }

  try {
    const dbUser = await findOrLinkUser({
      provider: 'email',
      providerId: data.user.id,
      email: body.email,
      name: body.name ?? undefined,
    })

    await setUserSession(event, {
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        avatarUrl: dbUser.avatarUrl,
      },
    })

    return { confirmationRequired: false }
  }
  catch (err) {
    ;(event.context.logger ?? logger).error({ err: err }, 'Email sign-up upsert error:')
    throw createError({ statusCode: 500, statusMessage: 'Account setup failed. Please try again.' })
  }
})
