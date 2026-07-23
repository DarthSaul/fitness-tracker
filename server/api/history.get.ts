defineRouteMeta({
  openAPI: {
    tags: ['History'],
    summary: 'Unified workout history',
    description: 'Returns the user\'s completed sessions across program workouts and standalone workouts as a single list ordered by completedAt DESC with id DESC as a deterministic tiebreaker. Each row carries a `type` discriminator (`PROGRAM` | `STANDALONE`) plus type-specific fields (program name/week/day vs. standalone workout summary). Optionally filter to one kind via `type=program` or `type=standalone`. Supports the same cursor pagination as the per-type history endpoints: `before` (ISO timestamp) paired with `beforeId` (session id) — both must be provided together — and a `limit` (default 20, clamped to 1..50).',
    parameters: [
      { name: 'type', in: 'query', required: false, schema: { type: 'string', enum: ['program', 'standalone'] }, description: 'Filter to a single session kind. Omit for the merged history.' },
      { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
      { name: 'before', in: 'query', required: false, schema: { type: 'string', format: 'date-time' }, description: 'Cursor timestamp — completedAt of the last row from the previous page. Must be paired with `beforeId`.' },
      { name: 'beforeId', in: 'query', required: false, schema: { type: 'string' }, description: 'Cursor tiebreaker — id of the last row from the previous page. Must be paired with `before`.' },
    ],
    responses: {
      200: { description: 'List of completed sessions across both kinds, newest first' },
      400: { description: 'Invalid type, limit, before, or beforeId parameter' },
      401: { description: 'Unauthorized' },
      500: { description: 'Internal server error' },
    },
  },
})

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const MIN_LIMIT = 1
const DIGITS_ONLY = /^\d+$/
const TYPES = ['program', 'standalone'] as const

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  // Defence in depth: Prisma drops undefined `where` keys, so an unset userId
  // would return every user's sessions. Fail closed instead.
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const query = getQuery(event)

  let type: (typeof TYPES)[number] | undefined
  if (query.type !== undefined) {
    if (typeof query.type !== 'string' || !(TYPES as readonly string[]).includes(query.type)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid type' })
    }
    type = query.type as (typeof TYPES)[number]
  }

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
    // Composite cursor: rows sharing a completedAt are tiebroken by id so a
    // page boundary can't silently drop sessions with identical timestamps.
    // The same predicate is applied to BOTH tables — cuids are globally unique
    // strings, so ordering by id is deterministic across the two kinds.
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
    const orderBy = [{ completedAt: 'desc' as const }, { id: 'desc' as const }]

    // Each table is asked for `limit` rows past the cursor; the merged top
    // `limit` is guaranteed to be contained in the union of the two lists.
    const [programSessions, standaloneSessions] = await Promise.all([
      type === 'standalone'
        ? []
        : prisma.workoutSession.findMany({
            where,
            orderBy,
            take: limit,
            include: {
              _count: { select: { completedSets: true } },
              userProgram: {
                select: {
                  program: { select: { name: true } },
                },
              },
            },
          }),
      type === 'program'
        ? []
        : prisma.standaloneWorkoutSession.findMany({
            where,
            orderBy,
            take: limit,
            include: {
              _count: { select: { completedSets: true } },
              standaloneWorkout: {
                select: { id: true, category: true, order: true, name: true },
              },
            },
          }),
    ])

    const programRows = programSessions.map((s: typeof programSessions[number]) => ({
      type: 'PROGRAM' as const,
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

    const standaloneRows = standaloneSessions.map((s: typeof standaloneSessions[number]) => ({
      type: 'STANDALONE' as const,
      id: s.id,
      userId: s.userId,
      standaloneWorkoutId: s.standaloneWorkoutId,
      standaloneWorkout: s.standaloneWorkout,
      status: s.status,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      notes: s.notes,
      _count: s._count,
    }))

    // Merge-sort the two kinds with the same (completedAt DESC, id DESC)
    // ordering the queries used, then trim to the page size. completedAt is
    // never null here (the where filters on it) — the ?? 0 only satisfies the
    // nullable Prisma type.
    const sessions = [...programRows, ...standaloneRows]
      .sort((a, b) => {
        const diff = (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)
        if (diff !== 0) return diff
        return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
      })
      .slice(0, limit)

    return { sessions }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/history' }, '[GET /api/history] Failed to fetch history')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch workout history' })
  }
})
