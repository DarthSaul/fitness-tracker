defineRouteMeta({
  openAPI: {
    tags: ['PT Routines'],
    summary: 'Get a PT routine',
    description: 'Returns one of the authenticated user\'s PT routines with its ordered exercise list.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'PtRoutine CUID' },
    ],
    responses: {
      200: {
        description: 'PT routine with ordered exercises',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/PtRoutine' } } },
      },
      400: { description: 'Missing routine ID' },
      401: { description: 'Unauthorized' },
      404: { description: 'Routine not found' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const id = getRouterParam(event, 'id')

  if (!id?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing routine ID' })
  }

  try {
    const routine = await prisma.ptRoutine.findUnique({
      where: { id },
      include: { exercises: { orderBy: { order: 'asc' } } },
    })

    if (!routine || routine.userId !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'Routine not found' })
    }

    return routine
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/pt-routines/:id' }, '[GET /api/pt-routines/:id] Failed to fetch routine')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch routine' })
  }
})
