defineRouteMeta({
  openAPI: {
    tags: ['User Programs'],
    summary: 'Activate a saved program',
    description: 'Activates a saved program, deactivating any other active program. Returns 409 if already active. Each UserProgram is one run: activating a run that is completed or archived never resumes it — it activates the program\'s open run, creating a fresh one at week 1, day 1 when none exists. The returned UserProgram may therefore carry a different id than the one requested; clients must adopt the returned record.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'UserProgram CUID' },
    ],
    responses: {
      200: { description: 'Program activated. The id differs from the path id when a finished run was restarted.' },
      400: { description: 'Missing user program ID' },
      404: { description: 'User program not found' },
      409: { description: 'Program already active' },
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

    // A finished run (completed, or unsaved-with-history) is never resumed
    const isTerminal = userProgram.completedAt !== null || userProgram.archivedAt !== null

    if (userProgram.isActive && !isTerminal) {
      throw createError({ statusCode: 409, statusMessage: 'Program already active' })
    }

    const include = { program: { select: { id: true, name: true, description: true } } }
    const deactivateOthers = { where: { userId, isActive: true }, data: { isActive: false } }

    return await prisma.$transaction(async (tx) => {
      if (!isTerminal) {
        await tx.userProgram.updateMany(deactivateOthers)
        return tx.userProgram.update({ where: { id }, data: { isActive: true }, include })
      }

      // Restart: resolve to the program's open run, creating one when needed
      const openRun = await tx.userProgram.findFirst({
        where: { userId, programId: userProgram.programId, completedAt: null, archivedAt: null },
      })
      if (openRun?.isActive) {
        throw createError({ statusCode: 409, statusMessage: 'Program already active' })
      }

      await tx.userProgram.updateMany(deactivateOthers)
      if (openRun) {
        return tx.userProgram.update({ where: { id: openRun.id }, data: { isActive: true }, include })
      }
      return tx.userProgram.create({
        data: { userId, programId: userProgram.programId, isActive: true },
        include,
      })
    })
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    // A concurrent activation won one of the partial unique indexes
    if ((error as { code?: string }).code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Program already active' })
    }
    ;(event.context.logger ?? logger).error({ err: error, route: 'PATCH /api/user-programs/:id/activate' }, '[PATCH /api/user-programs/:id/activate] Failed to activate program')
    throw createError({ statusCode: 500, statusMessage: 'Failed to activate program' })
  }
})
