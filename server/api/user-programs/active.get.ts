defineRouteMeta({
  openAPI: {
    tags: ['User Programs'],
    summary: 'Get active program',
    description: 'Returns the authenticated user\'s currently active program with full nested structure.',
    responses: {
      200: { description: 'Active program with nested weeks, days, exercise groups, exercises, and sets' },
      404: { description: 'No active program found' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  try {
    const activeProgram = await prisma.userProgram.findFirst({
      where: { userId, isActive: true },
      include: {
        program: {
          include: {
            weeks: {
              orderBy: { weekNumber: 'asc' },
              include: {
                days: {
                  orderBy: { dayNumber: 'asc' },
                  include: {
                    exerciseGroups: {
                      orderBy: { order: 'asc' },
                      include: {
                        exercises: {
                          orderBy: { order: 'asc' },
                          include: {
                            exercise: { select: { id: true, name: true } },
                            sets: { orderBy: { setNumber: 'asc' } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!activeProgram) {
      throw createError({ statusCode: 404, statusMessage: 'No active program found' })
    }

    return activeProgram
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[GET /api/user-programs/active] Failed to get active program', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to get active program' })
  }
})
