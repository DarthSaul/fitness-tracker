defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Update workout session notes',
    description: 'Updates the notes field on a workout session.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'WorkoutSession CUID' },
    ],
    responses: {
      200: { description: 'Updated session notes' },
      400: { description: 'Missing or invalid fields' },
      401: { description: 'Unauthorized' },
      404: { description: 'Session not found' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const id = getRouterParam(event, 'id')

  if (!id?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing session ID' })
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

    const session = await prisma.workoutSession.findUnique({
      where: { id },
    })

    if (!session || session.userId !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'Session not found' })
    }

    const updated = await prisma.workoutSession.update({
      where: { id },
      data: { notes },
    })

    return { id: updated.id, notes: updated.notes }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'PATCH /api/workouts/:id' }, '[PATCH /api/workouts/:id] Failed to update workout session')
    throw createError({ statusCode: 500, statusMessage: 'Failed to update workout session' })
  }
})
