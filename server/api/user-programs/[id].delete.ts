defineRouteMeta({
  openAPI: {
    tags: ['User Programs'],
    summary: 'Remove a saved program',
    description: 'Removes a program from the authenticated user\'s library. Workout history is never destroyed: every non-archived run of the program is processed — a run with no completed workouts is deleted outright, while a run with completed workouts is archived (hidden from the library, still visible in history and editable) and its unfinished sessions and scheduled workouts are removed. The response\'s archived flag reports whether any run was kept as history.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'UserProgram CUID' },
    ],
    responses: {
      200: { description: 'Program removed' },
      400: { description: 'Missing user program ID' },
      404: { description: 'User program not found' },
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

    // Unsave removes the PROGRAM from the library, so it covers all of its live
    // runs — otherwise an older completed run would keep it looking saved.
    const archived = await prisma.$transaction(async (tx) => {
      const runs = await tx.userProgram.findMany({
        where: { userId, programId: userProgram.programId, archivedAt: null },
        select: { id: true },
      })
      const runIds = runs.map((run) => run.id)

      const withHistory = await tx.workoutSession.findMany({
        where: { userProgramId: { in: runIds }, status: 'COMPLETED' },
        select: { userProgramId: true },
        distinct: ['userProgramId'],
      })
      const keepIds = withHistory.map((session) => session.userProgramId)
      const deleteIds = runIds.filter((runId) => !keepIds.includes(runId))

      if (deleteIds.length > 0) {
        await tx.userProgram.deleteMany({ where: { id: { in: deleteIds } } })
      }

      if (keepIds.length > 0) {
        await tx.userProgram.updateMany({
          where: { id: { in: keepIds } },
          data: { archivedAt: new Date(), isActive: false },
        })
        // GET /api/workouts/active finds IN_PROGRESS sessions by user alone, so
        // an unfinished session left on an archived run would keep resurfacing.
        await tx.workoutSession.deleteMany({
          where: { userProgramId: { in: keepIds }, status: { not: 'COMPLETED' } },
        })
        await tx.scheduledWorkout.deleteMany({ where: { userProgramId: { in: keepIds } } })
      }

      return keepIds.length > 0
    })

    return { success: true, archived }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'DELETE /api/user-programs/:id' }, '[DELETE /api/user-programs/:id] Failed to delete user program')
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete user program' })
  }
})
