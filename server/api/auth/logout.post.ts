defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Log out',
    description:
      'Web clients: clears the session cookie and redirects to /login. ' +
      'Native clients (X-Client-Type: native): optionally revokes the refresh token and returns JSON.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              refreshToken: { type: 'string', description: 'Refresh token to revoke (native clients only)' },
            },
          },
        },
      },
    },
    responses: {
      200: { description: 'Native client logout successful' },
      302: { description: 'Web client redirect to /login' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const isNative = getHeader(event, 'x-client-type') === 'native'
  const body = await readBody<{ refreshToken?: string }>(event).catch(() => null)

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
})
