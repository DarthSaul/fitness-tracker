defineRouteMeta({
  openAPI: {
    tags: ['User Programs'],
    summary: 'List sessions for active program',
    description: 'Returns all workout sessions for the user\'s active program, with completed set counts per session.',
    responses: {
      200: { description: 'List of workout sessions' },
      401: { description: 'Unauthorized' },
      404: { description: 'No active program' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  try {
    const activeProgram = await prisma.userProgram.findFirst({
      where: { userId, isActive: true },
    })

    if (!activeProgram) {
      throw createError({ statusCode: 404, statusMessage: 'No active program' })
    }

    const sessions = await prisma.workoutSession.findMany({
      where: { userProgramId: activeProgram.id },
      orderBy: [{ weekNumber: 'asc' }, { dayNumber: 'asc' }],
      include: {
        _count: { select: { completedSets: true } },
      },
    })

    return { sessions }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[GET /api/user-programs/active/sessions] Failed to fetch sessions', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch sessions' })
  }
})
