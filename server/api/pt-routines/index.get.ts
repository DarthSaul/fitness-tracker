defineRouteMeta({
  openAPI: {
    tags: ['PT Routines'],
    summary: 'List the current user\'s PT routines',
    description: 'Returns all of the authenticated user\'s PT routines with their ordered exercise lists. Exercises are presentational only — they are not tracked as part of a workout.',
    responses: {
      200: {
        description: 'PT routines with ordered exercises',
        content: {
          'application/json': {
            schema: { type: 'array', items: { $ref: '#/components/schemas/PtRoutine' } },
          },
        },
      },
      401: { description: 'Unauthorized' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  try {
    return await prisma.ptRoutine.findMany({
      where: { userId },
      include: { exercises: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    })
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/pt-routines' }, '[GET /api/pt-routines] Failed to fetch routines')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch routines' })
  }
})
