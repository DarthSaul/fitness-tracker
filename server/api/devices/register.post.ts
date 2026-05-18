defineRouteMeta({
  openAPI: {
    tags: ['Devices'],
    summary: 'Register device token',
    description: 'Registers an APNs device token for push notifications.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['token', 'platform', 'environment'],
            properties: {
              token: { type: 'string' },
              platform: { type: 'string', enum: ['IOS'] },
              environment: { type: 'string', enum: ['SANDBOX', 'PRODUCTION'] },
            },
          },
        },
      },
    },
    responses: {
      200: { description: 'Device token registered' },
      400: { description: 'Invalid request body' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const body = await readBody<{ token?: string; platform?: string; environment?: string }>(event)

  if (!body?.token) {
    throw createError({ statusCode: 400, statusMessage: 'token is required' })
  }
  if (body.platform !== 'IOS') {
    throw createError({ statusCode: 400, statusMessage: 'platform must be IOS' })
  }
  if (body.environment !== 'SANDBOX' && body.environment !== 'PRODUCTION') {
    throw createError({ statusCode: 400, statusMessage: 'environment must be SANDBOX or PRODUCTION' })
  }

  try {
    const deviceToken = await prisma.deviceToken.upsert({
      where: { token_environment: { token: body.token, environment: body.environment } },
      update: { userId, lastSeenAt: new Date(), revokedAt: null },
      create: {
        userId,
        token: body.token,
        platform: body.platform as 'IOS',
        environment: body.environment as 'SANDBOX' | 'PRODUCTION',
      },
    })

    return { id: deviceToken.id }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/devices/register' }, '[POST /api/devices/register] Failed to register device token')
    throw createError({ statusCode: 500, statusMessage: 'Failed to register device token' })
  }
})
