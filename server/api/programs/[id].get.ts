defineRouteMeta({
  openAPI: {
    tags: ['Programs'],
    summary: 'Get program by ID',
    description: 'Returns the detail of a single program with nested weeks. Days are returned as ID arrays — fetch full day detail via GET /api/programs/days/{id}.',
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Program CUID',
      },
    ],
    responses: {
      200: {
        description: 'Full program with nested structure',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ProgramDetail' },
          },
        },
      },
      400: {
        description: 'Missing program ID',
      },
      404: {
        description: 'Program not found',
      },
      500: {
        description: 'Internal server error',
      },
    },
  },
})

/**
 * Returns the detail of a single program with nested weeks.
 * Days are returned as ID arrays — fetch full day detail via
 * GET /api/programs/days/{id}.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing program ID' })
  }

  try {
    const program = await prisma.program.findUnique({
      where: { id },
      include: {
        weeks: {
          orderBy: { weekNumber: 'asc' },
          include: {
            days: {
              orderBy: { dayNumber: 'asc' },
              select: { id: true },
            },
          },
        },
      },
    })

    if (!program) {
      throw createError({ statusCode: 404, statusMessage: 'Program not found' })
    }

    return {
      ...program,
      weeks: program.weeks.map((week) => ({
        ...week,
        days: week.days.map((day: { id: string }) => day.id),
      })),
    }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[GET /api/programs/:id] Failed to fetch program', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch program' })
  }
})
