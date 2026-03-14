/**
 * Returns the full detail of a single program, including all nested
 * weeks → days → exercise groups → exercises → sets.
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
              include: {
                exerciseGroups: {
                  orderBy: { order: 'asc' },
                  include: {
                    exercises: {
                      orderBy: { order: 'asc' },
                      include: { sets: { orderBy: { setNumber: 'asc' } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!program) {
      throw createError({ statusCode: 404, statusMessage: 'Program not found' })
    }

    return program
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[GET /api/programs/:id] Failed to fetch program', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch program' })
  }
})
