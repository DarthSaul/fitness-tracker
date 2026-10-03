defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Log out',
    description:
      'Web clients: clears the session cookie and redirects to /login. ' +
      'Native clients: revokes the refresh token and the device\'s push token, then returns JSON. ' +
      'A request is treated as native if it sends X-Client-Type: native OR includes a refreshToken or a well-formed deviceToken in the request body. ' +
      'Send deviceToken only on a user-initiated sign-out: a forced sign-out (expired session) should keep the device registered. ' +
      'The device is revoked only alongside a live refreshToken belonging to the device\'s owner.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              refreshToken: { type: 'string', description: 'Refresh token to revoke; presence also triggers the native (JSON) logout path' },
              deviceToken: { type: 'string', description: 'APNs device token (hex, case-insensitive) to stop pushing to. Requires a live refreshToken in the same body owned by the device\'s user; best-effort, never fails the logout. A well-formed token also triggers the native (JSON) logout path' },
            },
          },
        },
      },
    },
    responses: {
      200: { description: 'Native client logout successful (via X-Client-Type header or refreshToken in request body)', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
      302: { description: 'Web client redirect to /login' },
    },
  },
})

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{ refreshToken?: string; deviceToken?: unknown }>(event).catch(() => null)
    // A malformed deviceToken is no native signal: without the header or a
    // refresh token, the request falls through to web logout.
    const deviceToken = parseApnsDeviceToken(body?.deviceToken)
    const isNative = getHeader(event, 'x-client-type') === 'native'
      || Boolean(body?.refreshToken)
      || deviceToken !== null

    if (body?.refreshToken) {
      const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(body.refreshToken),
      )
      const tokenHash = Buffer.from(hashBuffer).toString('hex')

      // Stop pushing the signed-out user's notifications to this phone. This
      // route is public, so the live refresh token is what proves who is
      // signing out — checked before it is revoked below — and the device is
      // revoked only if it belongs to that user. Best-effort throughout: no
      // identity, no owned token or a DB error just leaves it registered.
      if (deviceToken) {
        const owner = await prisma.refreshToken.findFirst({
          where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
          select: { userId: true },
        }).catch(() => null)
        if (owner) {
          await prisma.deviceToken.updateMany({
            where: { token: deviceToken, userId: owner.userId, revokedAt: null },
            data: { revokedAt: new Date() },
          }).catch((err: unknown) => {
            ;(event.context.logger ?? logger).warn({ err, route: 'POST /api/auth/logout' }, '[POST /api/auth/logout] Failed to revoke device token')
          })
        }
      }

      // Best-effort revocation — don't expose whether token existed
      await prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      }).catch(() => {})
    }

    if (isNative) {
      return { success: true }
    }

    await clearUserSession(event)
    return sendRedirect(event, '/login')
  } catch (err) {
    throw createError({
      statusCode: (err as { statusCode?: number }).statusCode || 500,
      statusMessage: (err as Error).message,
    })
  }
})
