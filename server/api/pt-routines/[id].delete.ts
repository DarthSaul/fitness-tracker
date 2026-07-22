defineRouteMeta({
  openAPI: {
    tags: ['PT Routines'],
    summary: 'Delete a PT routine',
    description: 'Deletes one of the authenticated user\'s PT routines and its exercises.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'PtRoutine CUID' },
    ],
    responses: {
      200: {
        description: 'Routine deleted',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } },
      },
      400: { description: 'Missing routine ID' },
      401: { description: 'Unauthorized' },
      404: { description: 'Routine not found' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const id = getRouterParam(event, 'id')

  if (!id?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing routine ID' })
  }

  try {
    // Atomic owner-scoped delete — count 0 covers both missing and other-user rows
    const result = await prisma.ptRoutine.deleteMany({ where: { id, userId } })

    if (result.count === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Routine not found' })
    }

    return { success: true }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'DELETE /api/pt-routines/:id' }, '[DELETE /api/pt-routines/:id] Failed to delete routine')
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete routine' })
  }
})
