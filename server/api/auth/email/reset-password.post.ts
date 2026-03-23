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
      200: { description: 'Reset email sent (if account exists)' },
      400: { description: 'Email is required' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string }>(event)

  if (!body.email) {
    throw createError({ statusCode: 400, statusMessage: 'Email is required.' })
  }

  const requestUrl = getRequestURL(event)
  const redirectTo = `${requestUrl.origin}/auth/reset-password`

  await supabase.auth.resetPasswordForEmail(body.email, { redirectTo })

  // Always return success to avoid leaking whether the email exists
  return { success: true }
})
