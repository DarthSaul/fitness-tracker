defineRouteMeta({
  openAPI: {
    tags: ['User Programs'],
    summary: 'List saved programs',
    description: 'Returns all programs the authenticated user has saved, with nested program details.',
    responses: {
      200: { description: 'List of saved programs' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  try {
    const userPrograms = await prisma.userProgram.findMany({
      where: { userId },
      include: {
        program: { select: { id: true, name: true, description: true } },
      },
      orderBy: { startedAt: 'desc' },
    })

    return userPrograms
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/user-programs' }, '[GET /api/user-programs] Failed to list user programs')
    throw createError({ statusCode: 500, statusMessage: 'Failed to list user programs' })
  }
})
