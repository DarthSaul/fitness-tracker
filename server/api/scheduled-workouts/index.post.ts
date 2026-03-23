defineRouteMeta({
  openAPI: {
    tags: ['Scheduled Workouts'],
    summary: 'Schedule a workout',
    description: 'Schedules a program day on a specific date. One workout per date, one schedule per program day.',
    responses: {
      201: { description: 'Scheduled workout created' },
      400: { description: 'Invalid or missing fields' },
      401: { description: 'Unauthorized' },
      403: { description: 'Forbidden — program belongs to another user' },
      409: { description: 'Conflict — date or day already scheduled' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody(event)
  const { userProgramId, weekNumber, dayNumber, scheduledDate } = body ?? {}

  if (!userProgramId || !weekNumber || !dayNumber || !scheduledDate) {
    throw createError({ statusCode: 400, statusMessage: 'userProgramId, weekNumber, dayNumber, and scheduledDate are required' })
  }

  if (!Number.isInteger(weekNumber) || weekNumber < 1) {
    throw createError({ statusCode: 400, statusMessage: 'weekNumber must be a positive integer' })
  }

  if (!Number.isInteger(dayNumber) || dayNumber < 1) {
    throw createError({ statusCode: 400, statusMessage: 'dayNumber must be a positive integer' })
  }

  // Validate date format
  const parsedDate = new Date(scheduledDate)
  if (isNaN(parsedDate.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'scheduledDate must be a valid date' })
  }

  // Verify ownership
  const userProgram = await prisma.userProgram.findUnique({
    where: { id: userProgramId },
    select: { userId: true, programId: true },
  })

  if (!userProgram) {
    throw createError({ statusCode: 404, statusMessage: 'User program not found' })
  }

  if (userProgram.userId !== userId) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  // Verify the program day exists
  const programDay = await prisma.programDay.findFirst({
    where: {
      programWeek: {
        programId: userProgram.programId,
        weekNumber,
      },
      dayNumber,
    },
  })

  if (!programDay) {
    throw createError({ statusCode: 400, statusMessage: `Program day not found for week ${weekNumber}, day ${dayNumber}` })
  }

  try {
    const scheduled = await prisma.scheduledWorkout.create({
      data: {
        userProgramId,
        weekNumber,
        dayNumber,
        scheduledDate: parsedDate,
      },
    })

    event.node.res.statusCode = 201
    return { scheduledWorkout: scheduled }
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'This day or date is already scheduled' })
    }
    console.error('[POST /api/scheduled-workouts] Failed to schedule workout', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to schedule workout' })
  }
})
