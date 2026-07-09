defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Remove the core section from a workout',
    description: 'Removes the core section from a workout session and deletes all core sets logged in it. Works on any session status to support the editing flow.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'WorkoutSession CUID' },
    ],
    responses: {
      200: { description: 'Core section and its logged sets removed' },
      400: { description: 'Missing session ID' },
      401: { description: 'Unauthorized' },
      404: { description: 'Session or core section not found' },
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
    // Wrap in transaction so the set deletion and section removal are atomic
    await prisma.$transaction(async (tx) => {
      const session = await tx.workoutSession.findUnique({ where: { id } })

      if (!session) {
        throw createError({ statusCode: 404, statusMessage: 'Session not found' })
      }

      if (session.userId !== userId) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found' })
      }

      if (session.coreSectionAddedAt === null) {
        throw createError({ statusCode: 404, statusMessage: 'Core section not found' })
      }

      await tx.completedCoreSet.deleteMany({ where: { workoutSessionId: id } })

      await tx.workoutSession.update({
        where: { id },
        data: { coreSectionAddedAt: null },
      })
    })

    return { deleted: true }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'DELETE /api/workouts/:id/core-section' }, '[DELETE /api/workouts/:id/core-section] Failed to remove core section')
    throw createError({ statusCode: 500, statusMessage: 'Failed to remove core section' })
  }
})
