defineRouteMeta({
  openAPI: {
    tags: ['Standalone Workout Sessions'],
    summary: 'List completed standalone workout sessions',
    description: 'Returns the user\'s completed standalone workout sessions ordered by completedAt DESC with id DESC as a deterministic tiebreaker. Supports cursor pagination via `before` (ISO timestamp) paired with `beforeId` (session id) — both must be provided together — and a `limit` (default 20, clamped to 1..50). Includes workout summary and completed-set count per session.',
    parameters: [
      { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
      { name: 'before', in: 'query', required: false, schema: { type: 'string', format: 'date-time' }, description: 'Cursor timestamp — completedAt of the last row from the previous page. Must be paired with `beforeId`.' },
      { name: 'beforeId', in: 'query', required: false, schema: { type: 'string' }, description: 'Cursor tiebreaker — id of the last row from the previous page. Must be paired with `before`.' },
    ],
    responses: {
      200: { description: 'List of completed standalone sessions, newest first' },
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
    // Composite cursor: rows sharing a completedAt are tiebroken by id so a page
    // boundary can't silently drop sessions with identical timestamps.
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

    const sessions = await prisma.standaloneWorkoutSession.findMany({
      where,
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: {
        _count: { select: { completedSets: true } },
        standaloneWorkout: {
          select: { id: true, category: true, order: true, name: true },
        },
      },
    })

    return { sessions }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/standalone-workout-sessions/history' }, '[GET /api/standalone-workout-sessions/history] Failed to fetch history')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch standalone workout history' })
  }
})
