defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Update a workout session',
    description:
      'Partially updates an existing workout session. Accepts `notes` (string ≤2000 chars) and/or `completedAt` (ISO date, not in the future) — at least one must be provided. Unlike `/complete`, this endpoint does not transition session state, so it can edit a session in any status (including COMPLETED).',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'WorkoutSession CUID' },
    ],
    responses: {
      200: { description: 'Updated session' },
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
    const rawBody = (await readBody(event)) ?? {}
    if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
    }
    const body = rawBody as { notes?: unknown; completedAt?: unknown }
    const hasNotes = 'notes' in body
    const hasCompletedAt = 'completedAt' in body

    if (!hasNotes && !hasCompletedAt) {
      throw createError({
        statusCode: 400,
        statusMessage: 'At least one of notes or completedAt must be provided',
      })
    }

    const updateData: { notes?: string; completedAt?: Date } = {}

    if (hasNotes) {
      const { notes } = body
      if (typeof notes !== 'string') {
        throw createError({ statusCode: 400, statusMessage: 'notes must be a string' })
      }
      if (notes.length > 2000) {
        throw createError({ statusCode: 400, statusMessage: 'notes must be 2000 characters or less' })
      }
      updateData.notes = notes
    }

    if (hasCompletedAt) {
      if (typeof body.completedAt !== 'string') {
        throw createError({ statusCode: 400, statusMessage: 'Invalid completedAt date' })
      }
      const completedAtDate = new Date(body.completedAt)
      if (isNaN(completedAtDate.getTime())) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid completedAt date' })
      }
      if (completedAtDate.getTime() > Date.now()) {
        throw createError({ statusCode: 400, statusMessage: 'completedAt cannot be in the future' })
      }
      updateData.completedAt = completedAtDate
    }

    const session = await prisma.workoutSession.findUnique({
      where: { id },
    })

    if (!session || session.userId !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'Session not found' })
    }

    const updated = await prisma.workoutSession.update({
      where: { id },
      data: updateData,
    })

    return { id: updated.id, notes: updated.notes, completedAt: updated.completedAt }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'PATCH /api/workouts/:id' }, '[PATCH /api/workouts/:id] Failed to update workout session')
    throw createError({ statusCode: 500, statusMessage: 'Failed to update workout session' })
  }
})
