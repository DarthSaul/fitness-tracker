defineRouteMeta({
  openAPI: {
    tags: ['Standalone Workouts'],
    summary: 'Get standalone workout by ID',
    description: 'Returns the full detail of a single standalone workout, including groups (with the optional "Cardio" label), exercises, and sets.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'StandaloneWorkout CUID' },
    ],
    responses: {
      200: { description: 'Full standalone workout with nested group/exercise/set structure' },
      400: { description: 'Missing workout ID' },
      401: { description: 'Unauthorized' },
      404: { description: 'Workout not found' },
      500: { description: 'Internal server error' },
    },
  },
})

/**
 * Returns the full detail of a single standalone workout:
 * groups → exercises → sets, each ordered.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')?.trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing workout ID' })
  }

  try {
    const workout = await prisma.standaloneWorkout.findUnique({
      where: { id },
      include: {
        groups: {
          orderBy: { order: 'asc' },
          include: {
            exercises: {
              orderBy: { order: 'asc' },
              include: {
                exercise: true,
                sets: { orderBy: { setNumber: 'asc' } },
              },
            },
          },
        },
      },
    })

    if (!workout) {
      throw createError({ statusCode: 404, statusMessage: 'Workout not found' })
    }

    return workout
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/standalone-workouts/:id' }, '[GET /api/standalone-workouts/:id] Failed to fetch standalone workout')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch standalone workout' })
  }
})
