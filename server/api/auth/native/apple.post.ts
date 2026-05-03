defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Native Sign in with Apple',
    description: 'Verifies an Apple identity token from the iOS Sign in with Apple SDK and returns JWT access/refresh tokens.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['identityToken'],
            properties: {
              identityToken: { type: 'string', description: 'JWT identity token from Apple SDK' },
              fullName: {
                type: 'object',
                properties: {
                  givenName: { type: 'string', nullable: true },
                  familyName: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
      },
    },
    responses: {
      200: { description: 'JWT access and refresh tokens' },
      400: { description: 'Missing identityToken' },
      401: { description: 'Invalid Apple identity token' },
      403: { description: 'Email not on allow-list' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    identityToken?: string
    fullName?: { givenName?: string | null; familyName?: string | null }
  }>(event)

  if (!body?.identityToken) {
    throw createError({ statusCode: 400, statusMessage: 'identityToken is required' })
  }

  let applePayload: { sub: string; email?: string }
  try {
    applePayload = await verifyAppleIdentityToken(body.identityToken)
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Invalid Apple identity token' })
  }

  const { sub, email } = applePayload
  if (!email) {
    throw createError({ statusCode: 400, statusMessage: 'Email not provided by Apple' })
  }

  if (!isEmailAllowed(email)) {
    throw createError({ statusCode: 403, statusMessage: 'You are not invited to use this app.' })
  }

  // Build display name — Apple only provides it on first sign-in
  const firstName = body.fullName?.givenName?.trim() ?? null
  const lastName = body.fullName?.familyName?.trim() ?? null
  const name = [firstName, lastName].filter(Boolean).join(' ') || null

  try {
    const user = await prisma.user.upsert({
      where: { provider_providerId: { provider: 'apple', providerId: sub } },
      update: {
        email,
        ...(name ? { name } : {}),
      },
      create: {
        email,
        name,
        avatarUrl: null,
        provider: 'apple',
        providerId: sub,
      },
    })

    const accessToken = await signAccessToken(user.id)

    // Generate raw refresh token — store only SHA-256 hash
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
    console.error('[POST /api/auth/native/apple] Failed', error)
    throw createError({ statusCode: 500, statusMessage: 'Sign-in failed. Please try again.' })
  }
})
