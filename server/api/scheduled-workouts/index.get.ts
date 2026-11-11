import type { Prisma } from '@prisma/client'

defineRouteMeta({
  openAPI: {
    tags: ['Scheduled Workouts'],
    summary: 'List scheduled workouts',
    description: 'With userProgramId, returns that run\'s scheduled program days. Without it, returns everything the caller has scheduled, program days and Strength on the Go workouts, each with standaloneWorkout ({ id, name, category }, null for a program day). Optionally filter by date range.',
    responses: {
      200: { description: 'Array of scheduled workouts' },
      400: { description: 'Invalid date params' },
      401: { description: 'Unauthorized' },
      403: { description: 'Forbidden — program belongs to another user' },
      404: { description: 'User program not found' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const userProgramId = query.userProgramId as string | undefined

  let where: Prisma.ScheduledWorkoutWhereInput
  if (userProgramId) {
    // Verify ownership
    const userProgram = await prisma.userProgram.findUnique({
      where: { id: userProgramId },
      select: { userId: true },
    })

    if (!userProgram) {
      throw createError({ statusCode: 404, statusMessage: 'User program not found' })
    }

    if (userProgram.userId !== userId) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    }

    where = { userProgramId }
  } else {
    // A program row saved by the previous client has no userId, so it is matched through its run.
    where = { OR: [{ userId }, { userProgram: { userId } }] }
  }

  const from = query.from as string | undefined
  const to = query.to as string | undefined

  if (from || to) {
    const scheduledDate: Prisma.DateTimeFilter = {}
    if (from) {
      const fromDate = new Date(from)
      if (isNaN(fromDate.getTime())) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid "from" date' })
      }
      scheduledDate.gte = fromDate
    }
    if (to) {
      const toDate = new Date(to)
      if (isNaN(toDate.getTime())) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid "to" date' })
      }
      scheduledDate.lte = toDate
    }
    where.scheduledDate = scheduledDate
  }

  try {
    const scheduledWorkouts = await prisma.scheduledWorkout.findMany({
      where,
      // The program-scoped listing keeps its original shape.
      ...(userProgramId ? {} : { include: { standaloneWorkout: { select: { id: true, name: true, category: true } } } }),
      orderBy: { scheduledDate: 'asc' },
    })

    return { scheduledWorkouts }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/scheduled-workouts' }, '[GET /api/scheduled-workouts] Failed to fetch scheduled workouts')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch scheduled workouts' })
  }
})
