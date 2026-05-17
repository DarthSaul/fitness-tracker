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
      200: { description: 'JWT access and refresh tokens', content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenResponse' } } } },
      400: { description: 'Missing identityToken' },
      401: { description: 'Invalid Apple identity token' },
      403: { description: 'Email not on allow-list' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  await rateLimitByIp(event)

  const body = await readBody<{
    identityToken?: string
    fullName?: { givenName?: string | null; familyName?: string | null }
  }>(event)

  if (!body?.identityToken || body.identityToken.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'identityToken is required' })
  }

  let applePayload: { sub: string; email?: string }
  try {
    applePayload = await verifyAppleIdentityToken(body.identityToken.trim())
  } catch (error) {
    const code = (error as { code?: string }).code ?? ''
    if (
      code.startsWith('ERR_JWT') ||
      code.startsWith('ERR_JWS') ||
      (error instanceof Error && error.message === 'Apple identity token missing email claim')
    ) {
      throw createError({ statusCode: 401, statusMessage: 'Invalid Apple identity token' })
    }
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/auth/native/apple' }, '[POST /api/auth/native/apple] JWKS or infrastructure error')
    throw createError({ statusCode: 500, statusMessage: 'Sign-in failed. Please try again.' })
  }

  const { sub, email } = applePayload
  if (!email) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid Apple identity token' })
  }

  if (!isEmailAllowed(email)) {
    throw createError({ statusCode: 403, statusMessage: 'You are not invited to use this app.' })
  }

  // Build display name — Apple only provides it on first sign-in.
  // Guard with typeof: readBody is untyped at runtime and non-string values must not reach .trim()
  const firstName = typeof body.fullName?.givenName === 'string' ? body.fullName.givenName.trim() : null
  const lastName = typeof body.fullName?.familyName === 'string' ? body.fullName.familyName.trim() : null
  const name = [firstName, lastName].filter(Boolean).join(' ') || null

  try {
    const user = await findOrLinkUser({
      provider: 'apple',
      providerId: sub,
      email,
      // Apple only sends fullName on first sign-in. Pass undefined (not null) on
      // subsequent calls so findOrLinkUser doesn't overwrite an existing name.
      name: name ?? undefined,
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
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/auth/native/apple' }, '[POST /api/auth/native/apple] Failed')
    throw createError({ statusCode: 500, statusMessage: 'Sign-in failed. Please try again.' })
  }
})
