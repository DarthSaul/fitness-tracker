defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Get active workout session',
    description: 'Returns the user\'s in-progress workout session with the full day template and already-completed sets. Returns 404 if no active session exists.',
    responses: {
      200: { description: 'Active workout session with day template and completed sets' },
      401: { description: 'Unauthorized' },
      404: { description: 'No active workout session' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  try {
    const session = await prisma.workoutSession.findFirst({
      where: { userId, status: 'IN_PROGRESS' },
      include: {
        completedSets: true,
        userProgram: true,
      },
    })

    if (!session) {
      throw createError({ statusCode: 404, statusMessage: 'No active workout session' })
    }

    const day = await prisma.programDay.findFirst({
      where: {
        programWeek: {
          programId: session.userProgram.programId,
          weekNumber: session.weekNumber,
        },
        dayNumber: session.dayNumber,
      },
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
    })

    if (!day) {
      throw createError({ statusCode: 500, statusMessage: 'Program day not found for session position' })
    }

    return { session, day }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[GET /api/workouts/active] Failed to fetch active session', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch active session' })
  }
})
