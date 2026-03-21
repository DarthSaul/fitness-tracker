defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Start a workout session',
    description: 'Creates a new workout session for the user\'s active program at the current day/week position. Returns 400 if no active program, 409 if a session is already in progress.',
    responses: {
      201: { description: 'Workout session started with day template' },
      400: { description: 'No active program' },
      401: { description: 'Unauthorized' },
      409: { description: 'Session already in progress' },
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
    // Use interactive transaction to prevent TOCTOU race on session creation
    const { session, currentDay } = await prisma.$transaction(async (tx) => {
      const activeProgram = await tx.userProgram.findFirst({
        where: { userId, isActive: true },
      })

      if (!activeProgram) {
        throw createError({ statusCode: 400, statusMessage: 'No active program' })
      }

      // Acquire row-level lock and re-read to get fresh values after any concurrent updates
      const [lockedProgram] = await tx.$queryRawUnsafe<Array<{ currentWeek: number; currentDay: number; isActive: boolean; programId: string; id: string }>>(
        'SELECT id, "currentWeek", "currentDay", "isActive", "programId" FROM "UserProgram" WHERE id = $1 FOR UPDATE',
        activeProgram.id,
      )

      if (!lockedProgram || !lockedProgram.isActive) {
        throw createError({ statusCode: 400, statusMessage: 'No active program' })
      }

      const existingSession = await tx.workoutSession.findFirst({
        where: { userProgramId: lockedProgram.id, status: 'IN_PROGRESS' },
      })

      if (existingSession) {
        throw createError({ statusCode: 409, statusMessage: 'Session already in progress' })
      }

      const day = await tx.programDay.findFirst({
        where: {
          programWeek: {
            programId: lockedProgram.programId,
            weekNumber: lockedProgram.currentWeek,
          },
          dayNumber: lockedProgram.currentDay,
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
        throw createError({ statusCode: 500, statusMessage: 'Program day not found for current position' })
      }

      const newSession = await tx.workoutSession.create({
        data: {
          userId,
          userProgramId: lockedProgram.id,
          weekNumber: lockedProgram.currentWeek,
          dayNumber: lockedProgram.currentDay,
        },
      })

      return { session: newSession, currentDay: day }
    })

    event.node.res.statusCode = 201
    return { session, day: currentDay }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    if ((error as { code?: string }).code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Session already in progress' })
    }
    console.error('[POST /api/workouts] Failed to start workout session', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to start workout session' })
  }
})
