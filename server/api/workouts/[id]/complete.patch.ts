defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Complete a workout day',
    description: 'Marks the workout session as completed. Advances the user\'s position only when the session matches the current position. Accepts optional completedAt for backdating. If the last day of the last week is completed, the program is deactivated.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'WorkoutSession CUID' },
    ],
    responses: {
      200: { description: 'Session completed with updated user program position' },
      400: { description: 'Missing session ID' },
      403: { description: 'Session belongs to another user' },
      404: { description: 'Session not found' },
      409: { description: 'Session already completed' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const id = getRouterParam(event, 'id')

  if (!id?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing session ID' })
  }

  try {
    const body = await readBody(event)
    const requestedCompletedAt = body?.completedAt

    // Validate completedAt if provided
    let completedAtDate: Date = new Date()
    if (requestedCompletedAt) {
      completedAtDate = new Date(requestedCompletedAt)
      if (isNaN(completedAtDate.getTime())) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid completedAt date' })
      }
      if (completedAtDate.getTime() > Date.now()) {
        throw createError({ statusCode: 400, statusMessage: 'completedAt cannot be in the future' })
      }
    }

    const session = await prisma.workoutSession.findUnique({
      where: { id },
      include: {
        userProgram: {
          include: {
            program: {
              include: {
                weeks: {
                  orderBy: { weekNumber: 'asc' },
                  include: {
                    days: {
                      orderBy: { dayNumber: 'asc' as const },
                      select: { id: true, dayNumber: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!session) {
      throw createError({ statusCode: 404, statusMessage: 'Session not found' })
    }

    if (session.userId !== userId) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    }

    if (session.status === 'COMPLETED') {
      throw createError({ statusCode: 409, statusMessage: 'Session already completed' })
    }

    const { userProgram } = session
    const weeks = userProgram.program.weeks

    // Find current position using ordered arrays (handles gaps in week/day numbers)
    const currentWeekIdx = weeks.findIndex((w) => w.weekNumber === session.weekNumber)
    const currentWeekData = currentWeekIdx >= 0 ? weeks[currentWeekIdx] : undefined
    const currentDayIdx = currentWeekData
      ? currentWeekData.days.findIndex((d) => d.dayNumber === session.dayNumber)
      : -1

    if (currentWeekIdx < 0 || currentDayIdx < 0) {
      throw createError({
        statusCode: 500,
        statusMessage: `Invalid program position: week ${session.weekNumber}, day ${session.dayNumber} not found in program ${userProgram.programId}`,
      })
    }

    // Only advance position when the session matches the current program position
    const isAtCurrentPosition =
      session.weekNumber === userProgram.currentWeek &&
      session.dayNumber === userProgram.currentDay

    let programCompleted = false
    let nextWeek = session.weekNumber
    let nextDay = session.dayNumber

    if (isAtCurrentPosition) {
      if (currentWeekData && currentDayIdx >= 0 && currentDayIdx < currentWeekData.days.length - 1) {
        // Not last day of week — advance to next day in ordered array
        const nextDayData = currentWeekData.days[currentDayIdx + 1]
        if (nextDayData) nextDay = nextDayData.dayNumber
      } else if (currentWeekIdx >= 0 && currentWeekIdx < weeks.length - 1) {
        // Last day of week, but not last week — scan forward for next week with days
        let found = false
        for (let i = currentWeekIdx + 1; i < weeks.length; i++) {
          const week = weeks[i]
          if (!week) continue
          if (week.days.length > 0) {
            const firstDay = week.days[0]
            if (!firstDay) continue
            nextWeek = week.weekNumber
            nextDay = firstDay.dayNumber
            found = true
            break
          }
        }
        if (!found) programCompleted = true
      } else {
        // Last day of last week — program complete
        programCompleted = true
      }
    }

    const [updatedSession, updatedUserProgram] = await prisma.$transaction([
      prisma.workoutSession.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: completedAtDate },
      }),
      prisma.userProgram.update({
        where: { id: userProgram.id },
        data: isAtCurrentPosition
          ? (programCompleted ? { isActive: false } : { currentWeek: nextWeek, currentDay: nextDay })
          : {},
      }),
    ])

    return { session: updatedSession, userProgram: updatedUserProgram, programCompleted }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[PATCH /api/workouts/:id/complete] Failed to complete workout', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to complete workout' })
  }
})
