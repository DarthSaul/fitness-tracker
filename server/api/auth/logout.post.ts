defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Log out',
    description:
      'Web clients: clears the session cookie and redirects to /login. ' +
      'Native clients: revokes the refresh token and the device\'s push token, then returns JSON. ' +
      'A request is treated as native if it sends X-Client-Type: native OR includes a refreshToken or deviceToken in the request body. ' +
      'Send deviceToken only on a user-initiated sign-out: a forced sign-out (expired session) should keep the device registered.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              refreshToken: { type: 'string', description: 'Refresh token to revoke; presence also triggers the native (JSON) logout path' },
              deviceToken: { type: 'string', description: 'APNs device token (hex) to stop pushing to; best-effort, never fails the logout. Presence also triggers the native (JSON) logout path' },
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
    const isNative = getHeader(event, 'x-client-type') === 'native'
      || Boolean(body?.refreshToken)
      || Boolean(body?.deviceToken)

    if (body?.refreshToken) {
      const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(body.refreshToken),
      )
      const tokenHash = Buffer.from(hashBuffer).toString('hex')
      // Best-effort revocation — don't expose whether token existed
      await prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      }).catch(() => {})
    }

    // Stop pushing the signed-out user's notifications to this phone. Keyed
    // on the token alone: this route is public, and holding a device's APNs
    // token is what identifies the device. A malformed token is ignored
    // rather than failing the sign-out.
    const deviceToken = body?.deviceToken
    if (isApnsDeviceToken(deviceToken)) {
      await prisma.deviceToken.updateMany({
        where: { token: deviceToken, revokedAt: null },
        data: { revokedAt: new Date() },
      }).catch((err: unknown) => {
        ;(event.context.logger ?? logger).warn({ err, route: 'POST /api/auth/logout' }, '[POST /api/auth/logout] Failed to revoke device token')
      })
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
