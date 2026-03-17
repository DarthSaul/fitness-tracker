defineRouteMeta({
  openAPI: {
    tags: ['User Programs'],
    summary: 'Deactivate a saved program',
    description: 'Deactivates the specified program. Returns 409 if already inactive.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'UserProgram CUID' },
    ],
    responses: {
      200: { description: 'Program deactivated' },
      400: { description: 'Missing user program ID' },
      404: { description: 'User program not found' },
      409: { description: 'Program already inactive' },
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

    if (!userProgram.isActive) {
      throw createError({ statusCode: 409, statusMessage: 'Program already inactive' })
    }

    const updated = await prisma.userProgram.update({
      where: { id },
      data: { isActive: false },
      include: {
        program: { select: { id: true, name: true, description: true } },
      },
    })

    return updated
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[PATCH /api/user-programs/:id/deactivate] Failed to deactivate program', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to deactivate program' })
  }
})
