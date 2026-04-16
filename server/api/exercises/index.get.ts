defineRouteMeta({
  openAPI: {
    tags: ['Exercises'],
    summary: 'List exercises',
    description: 'Returns all exercises, optionally filtered by name search.',
    parameters: [
      { name: 'search', in: 'query', required: false, schema: { type: 'string' }, description: 'Case-insensitive name filter' },
    ],
    responses: {
      200: { description: 'Array of exercises' },
      401: { description: 'Unauthorized' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const search = query.search

    const trimmed = typeof search === 'string' ? search.trim() : ''
    const where = trimmed
      ? { name: { contains: trimmed, mode: 'insensitive' as const } }
      : {}

    const exercises = await prisma.exercise.findMany({
      where,
      select: { id: true, name: true, description: true },
      orderBy: { name: 'asc' },
    })

    return exercises
  } catch (error) {
    console.error('[GET /api/exercises] Failed to fetch exercises', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch exercises' })
  }
})
