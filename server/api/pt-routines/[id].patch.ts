defineRouteMeta({
  openAPI: {
    tags: ['PT Routines'],
    summary: 'Update a PT routine',
    description: 'Partially updates a PT routine: rename it and/or atomically replace its full ordered exercise list (the array index drives the order). Each exercise has a title and exactly one of durationSeconds (1–3600) or reps (1–1000).',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'PtRoutine CUID' },
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'Knee Rehab' },
              exercises: {
                type: 'array',
                minItems: 1,
                maxItems: 50,
                items: { $ref: '#/components/schemas/PtRoutineExerciseInput' },
              },
            },
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Updated PT routine with ordered exercises',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/PtRoutine' } } },
      },
      400: { description: 'Missing or invalid fields' },
      401: { description: 'Unauthorized' },
      404: { description: 'Routine not found' },
      409: { description: 'Concurrent update' },
      500: { description: 'Internal server error' },
    },
  },
})

interface PtRoutineExerciseData {
  title: string
  durationSeconds: number | null
  reps: number | null
}

/**
 * Validates a raw `exercises` request-body value and returns sanitized rows.
 * Enforces: 1–50 entries, non-empty titles ≤ 100 chars, and exactly one of
 * durationSeconds (1–3600) / reps (1–1000) per exercise.
 * @throws {H3Error} 400 on the first violated rule.
 */
function validateExercises(exercises: unknown): PtRoutineExerciseData[] {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'exercises must be a non-empty array' })
  }
  if (exercises.length > 50) {
    throw createError({ statusCode: 400, statusMessage: 'exercises must contain 50 or fewer entries' })
  }

  return exercises.map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw createError({ statusCode: 400, statusMessage: 'Each exercise must be an object' })
    }
    const { title, durationSeconds, reps } = entry as { title?: unknown; durationSeconds?: unknown; reps?: unknown }

    if (typeof title !== 'string' || !title.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'Each exercise must have a non-empty title' })
    }
    if (title.trim().length > 100) {
      throw createError({ statusCode: 400, statusMessage: 'Exercise titles must be 100 characters or less' })
    }

    const hasDuration = durationSeconds !== undefined && durationSeconds !== null
    const hasReps = reps !== undefined && reps !== null
    if (hasDuration === hasReps) {
      throw createError({ statusCode: 400, statusMessage: 'Each exercise must have exactly one of durationSeconds or reps' })
    }
    if (hasDuration && (!Number.isInteger(durationSeconds) || (durationSeconds as number) < 1 || (durationSeconds as number) > 3600)) {
      throw createError({ statusCode: 400, statusMessage: 'durationSeconds must be an integer between 1 and 3600' })
    }
    if (hasReps && (!Number.isInteger(reps) || (reps as number) < 1 || (reps as number) > 1000)) {
      throw createError({ statusCode: 400, statusMessage: 'reps must be an integer between 1 and 1000' })
    }

    return {
      title: title.trim(),
      durationSeconds: hasDuration ? (durationSeconds as number) : null,
      reps: hasReps ? (reps as number) : null,
    }
  })
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const id = getRouterParam(event, 'id')

  if (!id?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing routine ID' })
  }

  try {
    const rawBody = (await readBody(event)) ?? {}
    if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
    }
    const body = rawBody as { name?: unknown; exercises?: unknown }
    const hasName = 'name' in body
    const hasExercises = 'exercises' in body

    if (!hasName && !hasExercises) {
      throw createError({ statusCode: 400, statusMessage: 'At least one of name or exercises must be provided' })
    }

    let name: string | undefined
    if (hasName) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        throw createError({ statusCode: 400, statusMessage: 'name must be a non-empty string' })
      }
      if (body.name.trim().length > 100) {
        throw createError({ statusCode: 400, statusMessage: 'name must be 100 characters or less' })
      }
      name = body.name.trim()
    }

    const exercises = hasExercises ? validateExercises(body.exercises) : undefined

    // Wrap in a transaction so the rename and full exercise-list replacement
    // are atomic and cannot interleave with a concurrent save
    const routine = await prisma.$transaction(async (tx) => {
      const existing = await tx.ptRoutine.findUnique({ where: { id } })

      if (!existing || existing.userId !== userId) {
        throw createError({ statusCode: 404, statusMessage: 'Routine not found' })
      }

      // Always update the routine row — an empty data object still bumps updatedAt
      await tx.ptRoutine.update({ where: { id }, data: name !== undefined ? { name } : {} })

      if (exercises) {
        await tx.ptRoutineExercise.deleteMany({ where: { ptRoutineId: id } })
        await tx.ptRoutineExercise.createMany({
          data: exercises.map((exercise, index) => ({
            ptRoutineId: id,
            ...exercise,
            order: index + 1,
          })),
        })
      }

      return tx.ptRoutine.findUnique({
        where: { id },
        include: { exercises: { orderBy: { order: 'asc' } } },
      })
    })

    return routine
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    if ((error as { code?: string }).code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Routine was updated concurrently — retry' })
    }
    ;(event.context.logger ?? logger).error({ err: error, route: 'PATCH /api/pt-routines/:id' }, '[PATCH /api/pt-routines/:id] Failed to update routine')
    throw createError({ statusCode: 500, statusMessage: 'Failed to update routine' })
  }
})
