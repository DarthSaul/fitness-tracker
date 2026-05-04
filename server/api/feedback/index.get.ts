defineRouteMeta({
  openAPI: {
    tags: ['Feedback'],
    summary: 'List feedback',
    description: 'Returns all feedback entries from every user, newest first.',
    responses: {
      200: { description: 'List of feedback entries' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async () => {
  try {
    const items = await prisma.feedback.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true } } },
    })

    return items.map((item) => ({
      ...item,
      screenshotUrl: item.screenshotPath
        ? supabase.storage.from('feedback-screenshots').getPublicUrl(item.screenshotPath).data.publicUrl
        : null,
    }))
  } catch (error) {
    console.error('[GET /api/feedback] Failed to fetch feedback', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch feedback' })
  }
})
