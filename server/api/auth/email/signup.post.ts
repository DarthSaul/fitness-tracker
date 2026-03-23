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
      200: { description: 'Account created and session established' },
      400: { description: 'Validation error or sign-up failed' },
    },
  },
})

export default defineEventHandler(async (event) => {
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
    const dbUser = await prisma.user.upsert({
      where: {
        provider_providerId: {
          provider: 'email',
          providerId: data.user.id,
        },
      },
      update: {
        name: body.name ?? null,
        email: body.email,
      },
      create: {
        email: body.email,
        name: body.name ?? null,
        avatarUrl: null,
        provider: 'email',
        providerId: data.user.id,
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

    return { confirmationRequired: false }
  }
  catch (err) {
    console.error('Email sign-up upsert error:', err)
    throw createError({ statusCode: 500, statusMessage: 'Account setup failed. Please try again.' })
  }
})
