defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Start a workout session',
    description: 'Creates a new workout session for the user\'s active program. By default creates at the current position. Pass weekNumber and dayNumber to create a retroactive session at a specific position.',
    responses: {
      201: { description: 'Workout session started with day template' },
      400: { description: 'No active program or invalid parameters' },
      401: { description: 'Unauthorized' },
      409: { description: 'Session already in progress or duplicate at position' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  try {
    const body = await readBody(event)
    const requestedWeek = body?.weekNumber
    const requestedDay = body?.dayNumber

    // Validate: either both or neither must be provided
    const hasWeek = requestedWeek !== undefined && requestedWeek !== null
    const hasDay = requestedDay !== undefined && requestedDay !== null
    if (hasWeek !== hasDay) {
      throw createError({ statusCode: 400, statusMessage: 'Both weekNumber and dayNumber must be provided together' })
    }

    const isRetroactive = hasWeek && hasDay

    if (isRetroactive) {
      if (!Number.isInteger(requestedWeek) || requestedWeek < 1) {
        throw createError({ statusCode: 400, statusMessage: 'weekNumber must be a positive integer' })
      }
      if (!Number.isInteger(requestedDay) || requestedDay < 1) {
        throw createError({ statusCode: 400, statusMessage: 'dayNumber must be a positive integer' })
      }
    }

    // Use interactive transaction to prevent TOCTOU race on session creation
    const { session, currentDay } = await prisma.$transaction(async (tx) => {
      const activeProgram = await tx.userProgram.findFirst({
        where: { userId, isActive: true },
      })

      if (!activeProgram) {
        throw createError({ statusCode: 400, statusMessage: 'No active program' })
      }

      // $queryRawUnsafe is needed for FOR UPDATE row-level locks (not expressible via Prisma's typed API).
      // Safe: the only interpolated value ($1) uses parameterized binding, not string concatenation.
      const [lockedProgram] = await tx.$queryRawUnsafe<Array<{ currentWeek: number; currentDay: number; isActive: boolean; programId: string; id: string }>>(
        'SELECT id, "currentWeek", "currentDay", "isActive", "programId" FROM "UserProgram" WHERE id = $1 FOR UPDATE',
        activeProgram.id,
      )

      if (!lockedProgram || !lockedProgram.isActive) {
        throw createError({ statusCode: 400, statusMessage: 'No active program' })
      }

      const targetWeek = isRetroactive ? requestedWeek : lockedProgram.currentWeek
      const targetDay = isRetroactive ? requestedDay : lockedProgram.currentDay

      if (isRetroactive) {
        // Reject sessions ahead of the current program position
        if (
          targetWeek > lockedProgram.currentWeek ||
          (targetWeek === lockedProgram.currentWeek && targetDay > lockedProgram.currentDay)
        ) {
          throw createError({ statusCode: 400, statusMessage: 'Cannot create a session ahead of current program position' })
        }

        // For retroactive sessions: only block duplicate at the same position
        const existingAtPosition = await tx.workoutSession.findFirst({
          where: { userProgramId: lockedProgram.id, weekNumber: targetWeek, dayNumber: targetDay },
        })

        if (existingAtPosition) {
          throw createError({ statusCode: 409, statusMessage: 'A session already exists for this week and day' })
        }
      } else {
        // For current-position sessions: block any IN_PROGRESS session
        const existingSession = await tx.workoutSession.findFirst({
          where: { userProgramId: lockedProgram.id, status: 'IN_PROGRESS' },
        })

        if (existingSession) {
          throw createError({ statusCode: 409, statusMessage: 'Session already in progress' })
        }
      }

      const day = await tx.programDay.findFirst({
        where: {
          programWeek: {
            programId: lockedProgram.programId,
            weekNumber: targetWeek,
          },
          dayNumber: targetDay,
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
        throw createError({ statusCode: 400, statusMessage: `Program day not found for week ${targetWeek}, day ${targetDay}` })
      }

      const newSession = await tx.workoutSession.create({
        data: {
          userId,
          userProgramId: lockedProgram.id,
          weekNumber: targetWeek,
          dayNumber: targetDay,
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
