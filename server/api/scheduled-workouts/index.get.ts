defineRouteMeta({
  openAPI: {
    tags: ['Scheduled Workouts'],
    summary: 'List scheduled workouts',
    description: 'Returns all scheduled workouts for a user program. Optionally filter by date range.',
    responses: {
      200: { description: 'Array of scheduled workouts' },
      400: { description: 'Missing userProgramId or invalid date params' },
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

  if (!userProgramId) {
    throw createError({ statusCode: 400, statusMessage: 'userProgramId is required' })
  }

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

  const where: { userProgramId: string; scheduledDate?: { gte?: Date; lte?: Date } } = { userProgramId }

  const from = query.from as string | undefined
  const to = query.to as string | undefined

  if (from || to) {
    where.scheduledDate = {}
    if (from) {
      const fromDate = new Date(from)
      if (isNaN(fromDate.getTime())) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid "from" date' })
      }
      where.scheduledDate.gte = fromDate
    }
    if (to) {
      const toDate = new Date(to)
      if (isNaN(toDate.getTime())) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid "to" date' })
      }
      where.scheduledDate.lte = toDate
    }
  }

  try {
    const scheduledWorkouts = await prisma.scheduledWorkout.findMany({
      where,
      orderBy: { scheduledDate: 'asc' },
    })

    return { scheduledWorkouts }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[GET /api/scheduled-workouts] Failed to fetch scheduled workouts', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch scheduled workouts' })
  }
})
