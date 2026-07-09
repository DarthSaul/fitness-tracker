defineRouteMeta({
  openAPI: {
    tags: ['Exercises'],
    summary: 'List core exercises',
    description: 'Returns all core exercises available for the workout core section, sorted by name.',
    responses: {
      200: { description: 'Array of core exercises', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Exercise' } } } } },
      401: { description: 'Unauthorized' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  try {
    const exercises = await prisma.exercise.findMany({
      where: { isCore: true },
      select: { id: true, name: true, description: true },
      orderBy: { name: 'asc' },
    })

    return exercises
  } catch (error) {
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/exercises/core' }, '[GET /api/exercises/core] Failed to fetch core exercises')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch core exercises' })
  }
})
