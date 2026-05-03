defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Email sign-in',
    description: 'Authenticates with email and password via Supabase Auth, upserts the user in the database, and establishes a session.',
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
      200: { description: 'Session established', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
      400: { description: 'Email and password are required' },
      401: { description: 'Invalid credentials' },
      403: { description: 'Email not on allow-list' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string, password?: string }>(event)

  if (!body.email || !body.password) {
    throw createError({ statusCode: 400, statusMessage: 'Email and password are required.' })
  }

  if (!isEmailAllowed(body.email)) {
    throw createError({ statusCode: 403, statusMessage: 'You are not invited to use this app.' })
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: body.email,
    password: body.password,
  })

  if (error) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password.' })
  }

  try {
    const dbUser = await findOrLinkUser({
      provider: 'email',
      providerId: data.user.id,
      email: data.user.email!,
    })

    await setUserSession(event, {
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        avatarUrl: dbUser.avatarUrl,
      },
    })

    return { success: true }
  }
  catch (err) {
    console.error('Email sign-in upsert error:', err)
    throw createError({ statusCode: 500, statusMessage: 'Sign-in failed. Please try again.' })
  }
})
