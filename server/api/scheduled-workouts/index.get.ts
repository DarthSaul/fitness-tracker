defineRouteMeta({
  openAPI: {
    tags: ['Scheduled Workouts'],
    summary: 'List scheduled workouts',
    description: 'Returns all scheduled workouts for a user program. Optionally filter by date range.',
    responses: {
      200: { description: 'Array of scheduled workouts' },
      400: { description: 'Missing userProgramId' },
      401: { description: 'Unauthorized' },
      403: { description: 'Forbidden — program belongs to another user' },
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
    if (from) where.scheduledDate.gte = new Date(from)
    if (to) where.scheduledDate.lte = new Date(to)
  }

  const scheduledWorkouts = await prisma.scheduledWorkout.findMany({
    where,
    orderBy: { scheduledDate: 'asc' },
  })

  return { scheduledWorkouts }
})
