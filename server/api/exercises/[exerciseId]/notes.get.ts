defineRouteMeta({
  openAPI: {
    tags: ['Exercises'],
    summary: 'Get user notes for an exercise',
    description: 'Returns the authenticated user\'s personal notes for a given exercise.',
    parameters: [
      { name: 'exerciseId', in: 'path', required: true, schema: { type: 'string' }, description: 'Exercise CUID' },
    ],
    responses: {
      200: { description: 'Exercise notes (may be null if not set)', content: { 'application/json': { schema: { type: 'object', properties: { notes: { type: ['string', 'null'], example: 'Keep elbows tucked' } } } } } },
      400: { description: 'Missing exercise ID' },
      401: { description: 'Unauthorized' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const exerciseId = getRouterParam(event, 'exerciseId')

  if (!exerciseId?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing exercise ID' })
  }

  try {
    const record = await prisma.userExerciseNote.findUnique({
      where: { userId_exerciseId: { userId, exerciseId } },
    })

    return { notes: record?.notes ?? null }
  } catch (error) {
    console.error('[GET /api/exercises/:exerciseId/notes] Failed to fetch exercise notes', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch exercise notes' })
  }
})
