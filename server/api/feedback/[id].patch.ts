defineRouteMeta({
  openAPI: {
    tags: ['Feedback'],
    summary: 'Update feedback',
    description: 'Updates the addressed status of a feedback entry.',
    responses: {
      200: { description: 'Feedback updated successfully' },
      400: { description: 'Missing or invalid addressed value' },
      404: { description: 'Feedback not found' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const id = getRouterParam(event, 'id') as string
  const body = await readBody(event)

  if (typeof body?.addressed !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'Missing addressed value' })
  }

  try {
    const existing = await prisma.feedback.findUnique({ where: { id } })
    if (!existing || existing.userId !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'Feedback not found' })
    }

    return await prisma.feedback.update({
      where: { id },
      data: { addressed: body.addressed },
    })
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[PATCH /api/feedback/:id] Failed to update feedback', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update feedback' })
  }
})
