defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'List completed workout sessions across all programs',
    description: 'Returns the user\'s completed workout sessions ordered by completedAt DESC. Supports cursor pagination via `before` (ISO timestamp) and a `limit` (default 20, clamped to 1..50). Includes program name and completed-set count per session.',
    parameters: [
      { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
      { name: 'before', in: 'query', required: false, schema: { type: 'string', format: 'date-time' }, description: 'Cursor — only sessions with completedAt strictly before this timestamp are returned.' },
    ],
    responses: {
      200: { description: 'List of completed sessions, newest first' },
      400: { description: 'Invalid limit or before parameter' },
      401: { description: 'Unauthorized' },
      500: { description: 'Internal server error' },
    },
  },
})

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const MIN_LIMIT = 1

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const query = getQuery(event) as { limit?: string; before?: string }

  let limit = DEFAULT_LIMIT
  if (query.limit !== undefined) {
    const parsed = Number.parseInt(query.limit, 10)
    if (!Number.isFinite(parsed)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid limit' })
    }
    limit = Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, parsed))
  }

  let before: Date | undefined
  if (query.before !== undefined && query.before !== '') {
    const parsed = new Date(query.before)
    if (Number.isNaN(parsed.getTime())) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid before timestamp' })
    }
    before = parsed
  }

  try {
    const sessions = await prisma.workoutSession.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        completedAt: before ? { not: null, lt: before } : { not: null },
      },
      orderBy: { completedAt: 'desc' },
      take: limit,
      include: {
        _count: { select: { completedSets: true } },
        userProgram: {
          select: {
            program: { select: { name: true } },
          },
        },
      },
    })

    const shaped = sessions.map((s: typeof sessions[number]) => ({
      id: s.id,
      userId: s.userId,
      userProgramId: s.userProgramId,
      programName: s.userProgram.program.name,
      weekNumber: s.weekNumber,
      dayNumber: s.dayNumber,
      status: s.status,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      notes: s.notes,
      _count: s._count,
    }))

    return { sessions: shaped }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[GET /api/workouts/history] Failed to fetch history', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch workout history' })
  }
})
