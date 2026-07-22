defineRouteMeta({
  openAPI: {
    tags: ['Exercises'],
    summary: 'Get demonstration media for an exercise',
    description: 'Returns an exercise\'s demonstration media (YouTube video link and, when available, a stored gif/animation URL). Global to the exercise — not user-specific.',
    parameters: [
      { name: 'exerciseId', in: 'path', required: true, schema: { type: 'string' }, description: 'Exercise CUID' },
    ],
    responses: {
      200: { description: 'Exercise media (URLs may be null when not yet set)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ExerciseInfo' } } } },
      400: { description: 'Missing exercise ID' },
      401: { description: 'Unauthorized' },
      404: { description: 'Exercise not found' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const exerciseId = getRouterParam(event, 'exerciseId')

  if (!exerciseId?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing exercise ID' })
  }

  try {
    const exercise = await prisma.exercise.findUnique({
      where: { id: exerciseId },
      select: { id: true, name: true, videoUrl: true, animationUrl: true },
    })

    if (!exercise) {
      throw createError({ statusCode: 404, statusMessage: 'Exercise not found' })
    }

    return exercise
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/exercises/:exerciseId/info' }, '[GET /api/exercises/:exerciseId/info] Failed to fetch exercise info')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch exercise info' })
  }
})
