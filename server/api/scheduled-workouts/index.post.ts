import type { H3Event } from 'h3'
import type { Prisma } from '@prisma/client'

defineRouteMeta({
  openAPI: {
    tags: ['Scheduled Workouts'],
    summary: 'Schedule a workout',
    description: 'Schedules a program day or a Strength on the Go workout on a specific date. Send userProgramId, weekNumber and dayNumber for a program day (one per date and one schedule per day, per run), or standaloneWorkoutId for a standalone workout (one per date per user). A program day and a standalone workout can share a date.',
    responses: {
      201: { description: 'Scheduled workout created' },
      400: { description: 'Invalid or missing fields, or both kinds sent' },
      401: { description: 'Unauthorized' },
      403: { description: 'Forbidden — program belongs to another user' },
      404: { description: 'User program or standalone workout not found' },
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
  const { userProgramId, weekNumber, dayNumber, standaloneWorkoutId, scheduledDate } = body ?? {}

  if (standaloneWorkoutId !== undefined) {
    return scheduleStandalone(event, userId, { userProgramId, weekNumber, dayNumber, standaloneWorkoutId, scheduledDate })
  }

  if (!userProgramId || !weekNumber || !dayNumber || !scheduledDate) {
    throw createError({ statusCode: 400, statusMessage: 'userProgramId, weekNumber, dayNumber, and scheduledDate are required' })
  }

  if (!Number.isInteger(weekNumber) || weekNumber < 1) {
    throw createError({ statusCode: 400, statusMessage: 'weekNumber must be a positive integer' })
  }

  if (!Number.isInteger(dayNumber) || dayNumber < 1) {
    throw createError({ statusCode: 400, statusMessage: 'dayNumber must be a positive integer' })
  }

  const parsedDate = parseScheduledDate(scheduledDate)

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

  return createScheduled(event, {
    data: { userId, userProgramId, weekNumber, dayNumber, scheduledDate: parsedDate },
    conflictMessage: 'This day or date is already scheduled',
  })
})

/** Schedules a Strength on the Go workout. The caller owns the row through userId alone. */
async function scheduleStandalone(
  event: H3Event,
  userId: string,
  fields: { userProgramId: unknown, weekNumber: unknown, dayNumber: unknown, standaloneWorkoutId: unknown, scheduledDate: unknown },
) {
  const { userProgramId, weekNumber, dayNumber, standaloneWorkoutId, scheduledDate } = fields

  if (userProgramId !== undefined || weekNumber !== undefined || dayNumber !== undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Send standaloneWorkoutId, or userProgramId, weekNumber and dayNumber, not both' })
  }

  if (typeof standaloneWorkoutId !== 'string' || !standaloneWorkoutId) {
    throw createError({ statusCode: 400, statusMessage: 'standaloneWorkoutId must be a non-empty string' })
  }

  if (!scheduledDate) {
    throw createError({ statusCode: 400, statusMessage: 'standaloneWorkoutId and scheduledDate are required' })
  }

  const parsedDate = parseScheduledDate(scheduledDate)

  const standaloneWorkout = await prisma.standaloneWorkout.findUnique({
    where: { id: standaloneWorkoutId },
    select: { id: true },
  })

  if (!standaloneWorkout) {
    throw createError({ statusCode: 404, statusMessage: 'Standalone workout not found' })
  }

  return createScheduled(event, {
    data: { userId, standaloneWorkoutId, scheduledDate: parsedDate },
    conflictMessage: 'A standalone workout is already scheduled on this date',
  })
}

function parseScheduledDate(scheduledDate: unknown): Date {
  const parsedDate = new Date(scheduledDate as string)
  if (isNaN(parsedDate.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'scheduledDate must be a valid date' })
  }
  return parsedDate
}

async function createScheduled(
  event: H3Event,
  { data, conflictMessage }: { data: Prisma.ScheduledWorkoutUncheckedCreateInput, conflictMessage: string },
) {
  try {
    const scheduled = await prisma.scheduledWorkout.create({ data })

    event.node.res.statusCode = 201
    return { scheduledWorkout: scheduled }
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: conflictMessage })
    }
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/scheduled-workouts' }, '[POST /api/scheduled-workouts] Failed to schedule workout')
    throw createError({ statusCode: 500, statusMessage: 'Failed to schedule workout' })
  }
}
