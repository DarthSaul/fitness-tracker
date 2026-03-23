defineRouteMeta({
  openAPI: {
    tags: ['Scheduled Workouts'],
    summary: 'Unschedule a workout',
    description: 'Removes a scheduled workout entry.',
    responses: {
      200: { description: 'Scheduled workout removed' },
      401: { description: 'Unauthorized' },
      403: { description: 'Forbidden — belongs to another user' },
      404: { description: 'Scheduled workout not found' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required' })
  }

  const scheduled = await prisma.scheduledWorkout.findUnique({
    where: { id },
    include: { userProgram: { select: { userId: true } } },
  })

  if (!scheduled) {
    throw createError({ statusCode: 404, statusMessage: 'Scheduled workout not found' })
  }

  if (scheduled.userProgram.userId !== userId) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  await prisma.scheduledWorkout.delete({ where: { id } })

  return { success: true }
})
