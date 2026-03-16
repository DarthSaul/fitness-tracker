defineRouteMeta({
  openAPI: {
    tags: ['Programs'],
    summary: 'Get program day by ID',
    description: 'Returns the full detail of a single program day, including exercise groups, exercises, and sets.',
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'ProgramDay CUID',
      },
    ],
    responses: {
      200: {
        description: 'Full program day with nested exercise structure',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ProgramDayDetail' },
          },
        },
      },
      400: {
        description: 'Missing day ID',
      },
      404: {
        description: 'Day not found',
      },
      500: {
        description: 'Internal server error',
      },
    },
  },
})

/**
 * Returns the full detail of a single program day, including
 * exerciseGroups → exercises → sets.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')?.trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing day ID' })
  }

  try {
    const day = await prisma.programDay.findUnique({
      where: { id },
      include: {
        exerciseGroups: {
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

    if (!day) {
      throw createError({ statusCode: 404, statusMessage: 'Day not found' })
    }

    return day
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[GET /api/programs/days/:id] Failed to fetch day', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch day' })
  }
})
