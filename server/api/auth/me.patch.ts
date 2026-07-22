defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Update current user settings',
    description: 'Updates the authenticated user\'s profile settings. Currently supports the ptRoutineInWorkout flag, which controls whether PT routines are shown in the active workout view.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['ptRoutineInWorkout'],
            properties: {
              ptRoutineInWorkout: { type: 'boolean', example: true },
            },
          },
        },
      },
    },
    responses: {
      200: { description: 'Updated user profile' },
      400: { description: 'Missing or invalid fields' },
      401: { description: 'Unauthorized' },
      404: { description: 'User not found' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  try {
    const rawBody = (await readBody(event)) ?? {}
    if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
    }
    const body = rawBody as { ptRoutineInWorkout?: unknown }

    if (!('ptRoutineInWorkout' in body)) {
      throw createError({ statusCode: 400, statusMessage: 'ptRoutineInWorkout must be provided' })
    }
    if (typeof body.ptRoutineInWorkout !== 'boolean') {
      throw createError({ statusCode: 400, statusMessage: 'ptRoutineInWorkout must be a boolean' })
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!user) {
      throw createError({ statusCode: 404, statusMessage: 'User not found' })
    }

    return await prisma.user.update({
      where: { id: userId },
      data: { ptRoutineInWorkout: body.ptRoutineInWorkout },
      select: { id: true, email: true, name: true, avatarUrl: true, ptRoutineInWorkout: true },
    })
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'PATCH /api/auth/me' }, '[PATCH /api/auth/me] Failed to update current user')
    throw createError({ statusCode: 500, statusMessage: 'Failed to update current user' })
  }
})
