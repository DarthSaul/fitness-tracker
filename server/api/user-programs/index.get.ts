defineRouteMeta({
  openAPI: {
    tags: ['User Programs'],
    summary: 'List saved programs',
    description: 'Returns the programs in the authenticated user\'s library, with nested program details. Each UserProgram is one run through a program; by default the list holds one current run per program (the open run, else the most recently completed one) and omits archived runs. Pass runs=all to receive every run, including completed and archived ones. Rows carry completedAt, archivedAt, runNumber (1-based, by start date within the program) and completedRunCount.',
    parameters: [
      { name: 'runs', in: 'query', required: false, schema: { type: 'string', enum: ['all'] }, description: 'Set to "all" to list every run instead of one current run per program' },
    ],
    responses: {
      200: { description: 'List of saved programs' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  try {
    const userPrograms = await prisma.userProgram.findMany({
      where: { userId },
      include: {
        program: { select: { id: true, name: true, description: true } },
      },
      orderBy: { startedAt: 'desc' },
    })

    // Rows arrive newest-first; number runs oldest-first within each program
    const runNumbers = new Map<string, number>()
    const runCounts = new Map<string, number>()
    const completedCounts = new Map<string, number>()
    for (const up of [...userPrograms].reverse()) {
      const runNumber = (runCounts.get(up.programId) ?? 0) + 1
      runCounts.set(up.programId, runNumber)
      runNumbers.set(up.id, runNumber)
      if (up.completedAt) completedCounts.set(up.programId, (completedCounts.get(up.programId) ?? 0) + 1)
    }

    const runs = userPrograms.map((up) => ({
      ...up,
      runNumber: runNumbers.get(up.id) ?? 1,
      completedRunCount: completedCounts.get(up.programId) ?? 0,
    }))

    if (getQuery(event).runs === 'all') return runs

    // One current run per program: the open run, else the latest completed one
    const current = new Map<string, (typeof runs)[number]>()
    for (const run of runs) {
      if (run.archivedAt) continue
      const chosen = current.get(run.programId)
      if (!chosen) {
        current.set(run.programId, run)
      } else if (chosen.completedAt && (!run.completedAt || run.completedAt > chosen.completedAt)) {
        current.set(run.programId, run)
      }
    }

    return runs.filter((run) => current.get(run.programId) === run)
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/user-programs' }, '[GET /api/user-programs] Failed to list user programs')
    throw createError({ statusCode: 500, statusMessage: 'Failed to list user programs' })
  }
})
