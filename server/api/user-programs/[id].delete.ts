defineRouteMeta({
  openAPI: {
    tags: ['User Programs'],
    summary: 'Remove a saved program',
    description: 'Removes a program from the authenticated user\'s library.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'UserProgram CUID' },
    ],
    responses: {
      200: { description: 'Program removed' },
      400: { description: 'Missing user program ID' },
      404: { description: 'User program not found' },
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

    await prisma.userProgram.delete({ where: { id } })

    return { success: true }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[DELETE /api/user-programs/:id] Failed to delete user program', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete user program' })
  }
})
