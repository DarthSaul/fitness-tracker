defineRouteMeta({
  openAPI: {
    tags: ['PT Routines'],
    summary: 'Create a PT routine',
    description: 'Creates a PT routine with an ordered exercise list. Each exercise has a title and exactly one of durationSeconds (1–3600) or reps (1–1000); the array index drives the order. Users may have at most 50 routines.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['name', 'exercises'],
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
      201: {
        description: 'Created PT routine with ordered exercises',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/PtRoutine' } } },
      },
      400: { description: 'Missing or invalid fields, or routine limit reached' },
      401: { description: 'Unauthorized' },
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

  try {
    const body = await readBody(event)
    const name = (body as { name?: unknown } | null)?.name

    if (typeof name !== 'string' || !name.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'name must be a non-empty string' })
    }
    if (name.trim().length > 100) {
      throw createError({ statusCode: 400, statusMessage: 'name must be 100 characters or less' })
    }

    const exercises = validateExercises((body as { exercises?: unknown }).exercises)

    const routineCount = await prisma.ptRoutine.count({ where: { userId } })
    if (routineCount >= 50) {
      throw createError({ statusCode: 400, statusMessage: 'Routine limit reached (50)' })
    }

    // Wrap in a transaction so the routine and its ordered exercises appear atomically
    const routine = await prisma.$transaction(async (tx) => {
      const created = await tx.ptRoutine.create({
        data: { userId, name: name.trim() },
      })

      await tx.ptRoutineExercise.createMany({
        data: exercises.map((exercise, index) => ({
          ptRoutineId: created.id,
          ...exercise,
          order: index + 1,
        })),
      })

      return tx.ptRoutine.findUnique({
        where: { id: created.id },
        include: { exercises: { orderBy: { order: 'asc' } } },
      })
    })

    event.node.res.statusCode = 201
    return routine
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/pt-routines' }, '[POST /api/pt-routines] Failed to create routine')
    throw createError({ statusCode: 500, statusMessage: 'Failed to create routine' })
  }
})
