defineRouteMeta({
  openAPI: {
    tags: ['Programs'],
    summary: 'List all programs',
    description: 'Returns a summary list of all programs in the library, ordered alphabetically.',
    responses: {
      200: {
        description: 'Array of program summaries (id, name, description, createdAt, week count)',
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: { $ref: '#/components/schemas/ProgramSummary' },
            },
          },
        },
      },
      500: {
        description: 'Internal server error',
      },
    },
  },
})

/** Returns a summary list of all programs in the library, ordered alphabetically. */
export default defineEventHandler(async (event) => {
  try {
    const programs = await prisma.program.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        _count: { select: { weeks: true } },
      },
      orderBy: { name: 'asc' },
    })
    return programs
  } catch (error) {
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/programs' }, '[GET /api/programs] Failed to fetch programs')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch programs' })
  }
})
