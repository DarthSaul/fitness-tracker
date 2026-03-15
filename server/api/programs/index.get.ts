defineRouteMeta({
  openAPI: {
    tags: ['Programs'],
    summary: 'List all programs',
    description: 'Returns a summary list of all programs in the library, ordered newest first.',
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

/** Returns a summary list of all programs in the library, ordered newest first. */
export default defineEventHandler(async () => {
  try {
    const programs = await prisma.program.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        _count: { select: { weeks: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return programs
  } catch (error) {
    console.error('[GET /api/programs] Failed to fetch programs', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch programs' })
  }
})
