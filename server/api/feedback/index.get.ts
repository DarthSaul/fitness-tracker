defineRouteMeta({
  openAPI: {
    tags: ['Feedback'],
    summary: 'List feedback',
    description: "Returns all feedback entries for the authenticated user, newest first.",
    responses: {
      200: { description: 'List of feedback entries' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  try {
    return await prisma.feedback.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
  } catch (error) {
    console.error('[GET /api/feedback] Failed to fetch feedback', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch feedback' })
  }
})
