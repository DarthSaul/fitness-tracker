defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Complete a workout day',
    description: 'Marks the workout session as completed and advances the user\'s position in the program. If the last day of the last week is completed, the program is deactivated.',
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
  const id = getRouterParam(event, 'id')

  if (!id?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing session ID' })
  }

  try {
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

    let programCompleted = false
    let nextWeek = session.weekNumber
    let nextDay = session.dayNumber

    if (currentWeekData && currentDayIdx >= 0 && currentDayIdx < currentWeekData.days.length - 1) {
      // Not last day of week — advance to next day in ordered array
      const nextDayData = currentWeekData.days[currentDayIdx + 1]
      if (nextDayData) nextDay = nextDayData.dayNumber
    } else if (currentWeekIdx >= 0 && currentWeekIdx < weeks.length - 1) {
      // Last day of week, but not last week — advance to first day of next week
      const nextWeekData = weeks[currentWeekIdx + 1]
      if (nextWeekData?.days[0]) {
        nextWeek = nextWeekData.weekNumber
        nextDay = nextWeekData.days[0].dayNumber
      }
    } else {
      // Last day of last week — program complete
      programCompleted = true
    }

    const [updatedSession, updatedUserProgram] = await prisma.$transaction([
      prisma.workoutSession.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      }),
      prisma.userProgram.update({
        where: { id: userProgram.id },
        data: programCompleted
          ? { isActive: false }
          : { currentWeek: nextWeek, currentDay: nextDay },
      }),
    ])

    return { session: updatedSession, userProgram: updatedUserProgram, programCompleted }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[PATCH /api/workouts/:id/complete] Failed to complete workout', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to complete workout' })
  }
})
