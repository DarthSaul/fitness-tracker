defineRouteMeta({
  openAPI: {
    tags: ['Feedback'],
    summary: 'Submit feedback',
    description: 'Saves a feedback entry from the authenticated user.',
    responses: {
      201: { description: 'Feedback saved successfully' },
      400: { description: 'Missing or empty content' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const body = await readBody(event)

  if (!body?.content?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing content' })
  }

  try {
    const feedback = await prisma.feedback.create({
      data: { userId, content: body.content.trim() },
    })

    event.node.res.statusCode = 201
    return feedback
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[POST /api/feedback] Failed to save feedback', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save feedback' })
  }
})
