defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Log out',
    description:
      'Web clients: clears the session cookie and redirects to /login. ' +
      'Native clients: revokes the refresh token and returns JSON. ' +
      'A request is treated as native if it sends X-Client-Type: native OR includes a refreshToken in the request body.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              refreshToken: { type: 'string', description: 'Refresh token to revoke; presence also triggers the native (JSON) logout path' },
            },
          },
        },
      },
    },
    responses: {
      200: { description: 'Native client logout successful (via X-Client-Type header or refreshToken in request body)' },
      302: { description: 'Web client redirect to /login' },
    },
  },
})

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{ refreshToken?: string }>(event).catch(() => null)
    const isNative = getHeader(event, 'x-client-type') === 'native' || Boolean(body?.refreshToken)

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
