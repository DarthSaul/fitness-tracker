defineRouteMeta({
  openAPI: {
    tags: ['Exercises'],
    summary: 'Upsert user notes for an exercise',
    description: 'Creates or updates the authenticated user\'s personal notes for a given exercise.',
    parameters: [
      { name: 'exerciseId', in: 'path', required: true, schema: { type: 'string' }, description: 'Exercise CUID' },
    ],
    responses: {
      200: { description: 'Upserted exercise note record' },
      400: { description: 'Missing or invalid fields' },
      401: { description: 'Unauthorized' },
      404: { description: 'Exercise not found' },
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
    const body = await readBody(event)
    const { notes } = body || {}

    if (typeof notes !== 'string') {
      throw createError({ statusCode: 400, statusMessage: 'notes must be a string' })
    }
    if (notes.length > 2000) {
      throw createError({ statusCode: 400, statusMessage: 'notes must be 2000 characters or less' })
    }

    const exercise = await prisma.exercise.findUnique({
      where: { id: exerciseId },
      select: { id: true },
    })

    if (!exercise) {
      throw createError({ statusCode: 404, statusMessage: 'Exercise not found' })
    }

    const record = await prisma.userExerciseNote.upsert({
      where: { userId_exerciseId: { userId, exerciseId } },
      create: { userId, exerciseId, notes },
      update: { notes },
    })

    return record
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[PUT /api/exercises/:exerciseId/notes] Failed to upsert exercise notes', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to upsert exercise notes' })
  }
})
