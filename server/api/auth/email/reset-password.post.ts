defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Request password reset',
    description: 'Sends a password reset email via Supabase Auth. Always returns success to avoid leaking whether an email exists.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email'],
            properties: {
              email: { type: 'string', format: 'email' },
            },
          },
        },
      },
    },
    responses: {
      200: { description: 'Reset email sent (if account exists)', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
      400: { description: 'Email is required' },
      429: { description: 'Too many requests' },
    },
  },
})

export default defineEventHandler(async (event) => {
  await rateLimitByIp(event)

  const body = await readBody<{ email?: string }>(event)

  if (!body.email) {
    throw createError({ statusCode: 400, statusMessage: 'Email is required.' })
  }

  // The redirect must come from config, never the request origin: native iOS
  // calls carry no meaningful web origin, and a header-derived value can
  // silently miss the Supabase redirect allowlist — the link then falls back
  // to the bare Site URL and the recovery tokens are dropped on the site
  // root, making the reset unrecoverable. appUrl is build-time validated and
  // known to match the allowlisted /auth/reset-password entries.
  const config = useRuntimeConfig()
  const redirectTo = `${config.public.appUrl}/auth/reset-password`

  await supabase.auth.resetPasswordForEmail(body.email, { redirectTo })

  // Always return success to avoid leaking whether the email exists
  return { success: true }
})
