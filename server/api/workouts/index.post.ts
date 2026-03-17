defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Start a workout session',
    description: 'Creates a new workout session for the user\'s active program at the current day/week position. Returns 400 if no active program, 409 if a session is already in progress.',
    responses: {
      201: { description: 'Workout session started with day template' },
      400: { description: 'No active program' },
      409: { description: 'Session already in progress' },
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
      throw createError({ statusCode: 400, statusMessage: 'No active program' })
    }

    const existingSession = await prisma.workoutSession.findFirst({
      where: { userProgramId: activeProgram.id, status: 'IN_PROGRESS' },
    })

    if (existingSession) {
      throw createError({ statusCode: 409, statusMessage: 'Session already in progress' })
    }

    const currentDay = await prisma.programDay.findFirst({
      where: {
        programWeek: {
          programId: activeProgram.programId,
          weekNumber: activeProgram.currentWeek,
        },
        dayNumber: activeProgram.currentDay,
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

    const session = await prisma.workoutSession.create({
      data: {
        userId,
        userProgramId: activeProgram.id,
        weekNumber: activeProgram.currentWeek,
        dayNumber: activeProgram.currentDay,
      },
    })

    event.node.res.statusCode = 201
    return { session, day: currentDay }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[POST /api/workouts] Failed to start workout session', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to start workout session' })
  }
})
