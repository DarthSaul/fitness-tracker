defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Refresh access token',
    description: 'Exchange a valid refresh token for a new access token. For native clients only.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['refreshToken'],
            properties: {
              refreshToken: { type: 'string' },
            },
          },
        },
      },
    },
    responses: {
      200: { description: 'New access token issued. refreshToken is only present when server-side rotation is enabled.', content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenResponse' } } } },
      400: { description: 'Missing refreshToken' },
      401: { description: 'Invalid, expired, or revoked refresh token' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const body = await readBody<{ refreshToken?: string }>(event)

  if (!body?.refreshToken) {
    throw createError({ statusCode: 400, statusMessage: 'refreshToken is required' })
  }

  // Hash the incoming token for DB lookup (we never store raw tokens)
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(body.refreshToken),
  )
  const tokenHash = Buffer.from(hashBuffer).toString('hex')

  try {
    await rateLimitByIp(event)
    const storedToken = await prisma.refreshToken.findUnique({ where: { tokenHash } })

    if (!storedToken) {
      throw createError({ statusCode: 401, statusMessage: 'Invalid refresh token' })
    }
    if (storedToken.expiresAt < new Date()) {
      throw createError({ statusCode: 401, statusMessage: 'Refresh token expired' })
    }
    if (storedToken.revokedAt !== null) {
      throw createError({ statusCode: 401, statusMessage: 'Refresh token revoked' })
    }

    // Check if rotation is enabled
    const rotationEnabled = process.env.NUXT_JWT_REFRESH_ROTATION === 'true'

    const now = new Date()
    let newRefreshToken: string | undefined
    let newRefreshTokenRecord: { tokenHash: string; expiresAt: Date } | undefined

    if (rotationEnabled) {
      // Generate new refresh token
      const raw = crypto.randomUUID() + crypto.randomUUID()
      const newHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
      const newTokenHash = Buffer.from(newHashBuffer).toString('hex')
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      newRefreshToken = raw
      newRefreshTokenRecord = { tokenHash: newTokenHash, expiresAt }
    }

    // Sign the access token before mutating DB state — a signing failure must
    // not consume the client's only refresh token
    const accessToken = await signAccessToken(storedToken.userId)

    // Atomic: conditional update guards against concurrent replay (TOCTOU)
    await prisma.$transaction(async (tx) => {
      const updated = await tx.refreshToken.updateMany({
        where: {
          id: storedToken.id,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          lastUsedAt: now,
          ...(rotationEnabled ? { revokedAt: now } : {}),
        },
      })
      if (updated.count !== 1) {
        throw createError({ statusCode: 401, statusMessage: 'Invalid refresh token' })
      }
      if (rotationEnabled && newRefreshTokenRecord) {
        await tx.refreshToken.create({
          data: {
            userId: storedToken.userId,
            tokenHash: newRefreshTokenRecord.tokenHash,
            expiresAt: newRefreshTokenRecord.expiresAt,
            deviceInfo: storedToken.deviceInfo,
          },
        })
      }
    })

    return {
      accessToken,
      ...(rotationEnabled && newRefreshToken ? { refreshToken: newRefreshToken } : {}),
    }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/auth/refresh' }, '[POST /api/auth/refresh] Failed to refresh token')
    throw createError({ statusCode: 500, statusMessage: 'Failed to refresh token' })
  }
})
