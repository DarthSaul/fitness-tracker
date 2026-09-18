defineRouteMeta({
  openAPI: {
    tags: ['User Programs'],
    summary: 'End a program run early',
    description: 'Marks an open run as completed before its final day, whether it is active or paused: the run is deactivated and stamped with completedAt, and its unfinished sessions and scheduled workouts are deleted. Completed workouts are kept and stay editable. To start the program again, call PATCH /api/user-programs/:id/activate with this id — it returns a fresh run at week 1, day 1. Returns 409 if the run is already completed or archived, or has no completed workouts.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'UserProgram CUID' },
    ],
    responses: {
      200: { description: 'Run completed' },
      400: { description: 'Missing user program ID' },
      404: { description: 'User program not found' },
      409: { description: 'Program already completed, or the run has no completed workouts' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const id = getRouterParam(event, 'id')

  if (!id?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing user program ID' })
  }

  try {
    const userProgram = await prisma.userProgram.findUnique({ where: { id } })
    if (!userProgram || userProgram.userId !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'User program not found' })
    }

    if (userProgram.completedAt !== null || userProgram.archivedAt !== null) {
      throw createError({ statusCode: 409, statusMessage: 'Program already completed' })
    }

    // A run with no history is still at week 1, day 1 — there is nothing to end,
    // and completing it would leave an empty "Completed" run in the library
    const completedSessions = await prisma.workoutSession.count({
      where: { userProgramId: id, status: 'COMPLETED' },
    })
    if (completedSessions === 0) {
      throw createError({ statusCode: 409, statusMessage: 'No completed workouts in this run' })
    }

    return await prisma.$transaction(async (tx) => {
      // Guarded write: a concurrent complete or unsave may have finished the run
      // since the read above. Done first so a lost race deletes nothing.
      const { count } = await tx.userProgram.updateMany({
        where: { id, completedAt: null, archivedAt: null },
        data: { isActive: false, completedAt: new Date() },
      })
      if (count === 0) {
        throw createError({ statusCode: 409, statusMessage: 'Program already completed' })
      }

      // GET /api/workouts/active finds IN_PROGRESS sessions by user alone, so
      // an unfinished session left on a completed run would keep resurfacing.
      await tx.workoutSession.deleteMany({
        where: { userProgramId: id, status: { not: 'COMPLETED' } },
      })
      await tx.scheduledWorkout.deleteMany({ where: { userProgramId: id } })

      return tx.userProgram.findUnique({
        where: { id },
        include: {
          program: { select: { id: true, name: true, description: true } },
        },
      })
    })
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'PATCH /api/user-programs/:id/complete' }, '[PATCH /api/user-programs/:id/complete] Failed to complete program')
    throw createError({ statusCode: 500, statusMessage: 'Failed to complete program' })
  }
})
