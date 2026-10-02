defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Current user profile',
    description:
      'Returns the authenticated user\'s own profile and settings (`meSelect`, server/utils/profile.ts): `id`, `email`, '
      + '`name`, `avatarUrl`, `ptRoutineInWorkout`, `profileVisibility` (`PUBLIC` | `PRIVATE`), `username`, `bio` '
      + '(string or null), `showActiveProgram` and `showWorkoutCount`. The only response that includes the caller\'s email; '
      + 'the two `show…` settings are visible only to the owner.',
    responses: {
      200: { description: 'Current user profile' },
      401: { description: 'Unauthorized' },
      404: { description: 'User not found' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: meSelect,
    })

    if (!user) {
      throw createError({ statusCode: 404, statusMessage: 'User not found' })
    }

    return user
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/auth/me' }, '[GET /api/auth/me] Failed to fetch current user')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch current user' })
  }
})
