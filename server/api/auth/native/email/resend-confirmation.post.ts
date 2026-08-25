defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Resend confirmation email',
    description: 'Resends the sign-up confirmation email via Supabase Auth. Always reports success so account existence is not leaked.',
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
      200: { description: 'Request accepted', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
      400: { description: 'Email is required' },
      429: { description: 'Too many requests' },
    },
  },
})

export default defineEventHandler(async (event) => {
  await rateLimitByIp(event)

  const body = await readBody<{ email?: string }>(event)

  if (!body?.email) {
    throw createError({ statusCode: 400, statusMessage: 'Email is required.' })
  }

  // Always report success: surfacing Supabase's errors here (unknown address,
  // already confirmed, its ~60s per-address resend cooldown) would leak
  // account state to an unauthenticated caller.
  try {
    const { error } = await supabase.auth.resend({ type: 'signup', email: body.email })
    if (error) {
      ;(event.context.logger ?? logger).warn({ err: error, route: 'POST /api/auth/native/email/resend-confirmation' }, '[POST /api/auth/native/email/resend-confirmation] Resend failed')
    }
  } catch (error) {
    ;(event.context.logger ?? logger).warn({ err: error, route: 'POST /api/auth/native/email/resend-confirmation' }, '[POST /api/auth/native/email/resend-confirmation] Resend failed')
  }

  return { success: true }
})
