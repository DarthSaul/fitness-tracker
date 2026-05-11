defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'List completed workout sessions across all programs',
    description: 'Returns the user\'s completed workout sessions ordered by completedAt DESC with id DESC as a deterministic tiebreaker. Supports cursor pagination via `before` (ISO timestamp) paired with `beforeId` (session id) — both must be provided together — and a `limit` (default 20, clamped to 1..50). Includes program name and completed-set count per session.',
    parameters: [
      { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
      { name: 'before', in: 'query', required: false, schema: { type: 'string', format: 'date-time' }, description: 'Cursor timestamp — completedAt of the last row from the previous page. Must be paired with `beforeId`.' },
      { name: 'beforeId', in: 'query', required: false, schema: { type: 'string' }, description: 'Cursor tiebreaker — id of the last row from the previous page. Must be paired with `before`.' },
    ],
    responses: {
      200: { description: 'List of completed sessions, newest first' },
      400: { description: 'Invalid limit, before, or beforeId parameter' },
      401: { description: 'Unauthorized' },
      500: { description: 'Internal server error' },
    },
  },
})

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const MIN_LIMIT = 1
const DIGITS_ONLY = /^\d+$/

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  // Repeated query params (e.g. `?limit=1&limit=2`) arrive as arrays from
  // getQuery, so each input is validated as a non-empty string before use.
  const query = getQuery(event)

  let limit = DEFAULT_LIMIT
  if (query.limit !== undefined) {
    if (typeof query.limit !== 'string' || !DIGITS_ONLY.test(query.limit)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid limit' })
    }
    limit = Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, Number.parseInt(query.limit, 10)))
  }

  let before: Date | undefined
  let beforeId: string | undefined
  if (query.before !== undefined || query.beforeId !== undefined) {
    if (query.before === undefined || query.beforeId === undefined) {
      throw createError({ statusCode: 400, statusMessage: 'before and beforeId must be provided together' })
    }
    if (typeof query.before !== 'string' || query.before === '') {
      throw createError({ statusCode: 400, statusMessage: 'Invalid before' })
    }
    if (typeof query.beforeId !== 'string' || query.beforeId === '') {
      throw createError({ statusCode: 400, statusMessage: 'Invalid beforeId' })
    }
    const parsed = new Date(query.before)
    if (Number.isNaN(parsed.getTime())) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid before timestamp' })
    }
    before = parsed
    beforeId = query.beforeId
  }

  try {
    // Composite cursor: rows with the same completedAt are tiebroken by id.
    // Without this, sessions sharing a ms-precision timestamp at a page boundary
    // can be silently dropped by `completedAt < before`.
    const where = before
      ? {
          userId,
          status: 'COMPLETED' as const,
          completedAt: { not: null },
          OR: [
            { completedAt: { lt: before } },
            { completedAt: before, id: { lt: beforeId } },
          ],
        }
      : {
          userId,
          status: 'COMPLETED' as const,
          completedAt: { not: null },
        }

    const sessions = await prisma.workoutSession.findMany({
      where,
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
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
