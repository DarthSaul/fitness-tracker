defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Native Sign in with Google',
    description: 'Verifies a Google ID token from the iOS Google Sign-In SDK and returns JWT access/refresh tokens.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['idToken'],
            properties: {
              idToken: { type: 'string', description: 'ID token from Google Sign-In SDK' },
            },
          },
        },
      },
    },
    responses: {
      200: { description: 'JWT access and refresh tokens' },
      400: { description: 'Missing idToken' },
      401: { description: 'Invalid Google ID token' },
      403: { description: 'Email not on allow-list' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const body = await readBody<{ idToken?: string }>(event)

  if (!body?.idToken) {
    throw createError({ statusCode: 400, statusMessage: 'idToken is required' })
  }

  let googlePayload: { sub: string; email: string; name?: string; picture?: string }
  try {
    googlePayload = await verifyGoogleIdToken(body.idToken)
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Invalid Google ID token' })
  }

  const { sub, email, name: googleName, picture } = googlePayload

  if (!isEmailAllowed(email)) {
    throw createError({ statusCode: 403, statusMessage: 'You are not invited to use this app.' })
  }

  try {
    const user = await prisma.user.upsert({
      where: { provider_providerId: { provider: 'google', providerId: sub } },
      update: {
        email,
        name: googleName ?? null,
        avatarUrl: picture ?? null,
      },
      create: {
        email,
        name: googleName ?? null,
        avatarUrl: picture ?? null,
        provider: 'google',
        providerId: sub,
      },
    })

    const accessToken = await signAccessToken(user.id)

    const raw = crypto.randomUUID() + crypto.randomUUID()
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
    const tokenHash = Buffer.from(hashBuffer).toString('hex')

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        deviceInfo: getHeader(event, 'user-agent') ?? null,
      },
    })

    return { accessToken, refreshToken: raw }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[POST /api/auth/native/google] Failed', error)
    throw createError({ statusCode: 500, statusMessage: 'Sign-in failed. Please try again.' })
  }
})
