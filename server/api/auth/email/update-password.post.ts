defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Update password',
    description: 'Completes a password reset by setting a new password using the tokens from the reset email link.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['accessToken', 'refreshToken', 'newPassword'],
            properties: {
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
              newPassword: { type: 'string' },
            },
          },
        },
      },
    },
    responses: {
      200: { description: 'Password updated successfully' },
      400: { description: 'Validation error or update failed' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    accessToken?: string
    refreshToken?: string
    newPassword?: string
  }>(event)

  if (!body.accessToken || !body.refreshToken || !body.newPassword) {
    throw createError({ statusCode: 400, statusMessage: 'Access token, refresh token, and new password are required.' })
  }

  if (body.newPassword.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'Password must be at least 8 characters.' })
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: body.accessToken,
    refresh_token: body.refreshToken,
  })

  if (sessionError) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid or expired reset link. Please request a new one.' })
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: body.newPassword,
  })

  if (updateError) {
    throw createError({ statusCode: 400, statusMessage: updateError.message })
  }

  return { success: true }
})
