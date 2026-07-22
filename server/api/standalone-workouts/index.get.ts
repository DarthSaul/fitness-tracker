defineRouteMeta({
  openAPI: {
    tags: ['Standalone Workouts'],
    summary: 'List standalone workouts',
    description: 'Returns a summary list of all standalone ("on the go") workouts, ordered by category then order. Optionally filter by category via the `category` query parameter.',
    parameters: [
      { name: 'category', in: 'query', required: false, schema: { type: 'string' }, description: 'Filter to a single category (e.g. "Upper Push").' },
    ],
    responses: {
      200: { description: 'Array of standalone workout summaries (id, category, order, name, description, createdAt, group count)' },
      400: { description: 'Invalid category parameter' },
      401: { description: 'Unauthorized' },
      500: { description: 'Internal server error' },
    },
  },
})

/**
 * Returns a summary list of all standalone workouts, ordered by category then
 * order. Reference data available to any authenticated user (not user-owned).
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  let category: string | undefined
  if (query.category !== undefined) {
    if (typeof query.category !== 'string' || query.category.trim() === '') {
      throw createError({ statusCode: 400, statusMessage: 'Invalid category' })
    }
    category = query.category
  }

  try {
    const workouts = await prisma.standaloneWorkout.findMany({
      where: category ? { category } : undefined,
      orderBy: [{ category: 'asc' }, { order: 'asc' }],
      select: {
        id: true,
        category: true,
        order: true,
        name: true,
        description: true,
        createdAt: true,
        _count: { select: { groups: true } },
      },
    })
    return workouts
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/standalone-workouts' }, '[GET /api/standalone-workouts] Failed to fetch standalone workouts')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch standalone workouts' })
  }
})
