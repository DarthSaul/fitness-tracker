defineRouteMeta({
  openAPI: {
    tags: ['User Programs'],
    summary: 'Activate a saved program',
    description: 'Activates a saved program, deactivating any other active program. Returns 409 if already active.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'UserProgram CUID' },
    ],
    responses: {
      200: { description: 'Program activated' },
      400: { description: 'Missing user program ID' },
      404: { description: 'User program not found' },
      409: { description: 'Program already active' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const id = getRouterParam(event, 'id')

  if (!id?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing user program ID' })
  }

  try {
    const userProgram = await prisma.userProgram.findUnique({ where: { id } })
    if (!userProgram || userProgram.userId !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'User program not found' })
    }

    if (userProgram.isActive) {
      throw createError({ statusCode: 409, statusMessage: 'Program already active' })
    }

    const result = await prisma.$transaction([
      prisma.userProgram.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      }),
      prisma.userProgram.update({
        where: { id },
        data: { isActive: true },
        include: {
          program: { select: { id: true, name: true, description: true } },
        },
      }),
    ])

    return result[1]
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[PATCH /api/user-programs/:id/activate] Failed to activate program', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to activate program' })
  }
})
