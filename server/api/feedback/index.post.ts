defineRouteMeta({
  openAPI: {
    tags: ['Feedback'],
    summary: 'Submit feedback',
    description: 'Saves a feedback entry from the authenticated user. Accepts multipart/form-data with an optional screenshot file (image/*, max 5 MB).',
    responses: {
      201: { description: 'Feedback saved successfully' },
      400: { description: 'Missing content, invalid file type, or file too large' },
      500: { description: 'Internal server error' },
    },
  },
})

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024 // 5 MB

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  try {
    const parts = await readMultipartFormData(event)

    const contentPart = parts?.find((p) => p.name === 'content')
    const content = contentPart?.data?.toString('utf8')?.trim()

    if (!content) {
      throw createError({ statusCode: 400, statusMessage: 'Missing content' })
    }

    let screenshotPath: string | null = null

    const filePart = parts?.find((p) => p.name === 'screenshot' && p.data?.length)
    if (filePart) {
      if (!filePart.type?.startsWith('image/')) {
        throw createError({ statusCode: 400, statusMessage: 'Screenshot must be an image' })
      }
      if (filePart.data.length > MAX_SCREENSHOT_BYTES) {
        throw createError({ statusCode: 400, statusMessage: 'Screenshot must be under 5 MB' })
      }

      const filename = filePart.filename ?? `screenshot-${Date.now()}`
      const storagePath = `${userId}/${Date.now()}-${filename}`

      const { data, error } = await supabase.storage
        .from('feedback-screenshots')
        .upload(storagePath, filePart.data, { contentType: filePart.type, upsert: false })

      if (error) {
        ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/feedback' }, '[POST /api/feedback] Screenshot upload failed')
        throw createError({ statusCode: 500, statusMessage: 'Failed to upload screenshot' })
      }

      screenshotPath = data.path
    }

    try {
      const feedback = await prisma.feedback.create({
        data: { userId, content, screenshotPath },
      })

      event.node.res.statusCode = 201
      return feedback
    } catch (dbError) {
      if (screenshotPath) {
        await supabase.storage.from('feedback-screenshots').remove([screenshotPath])
      }
      throw dbError
    }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/feedback' }, '[POST /api/feedback] Failed to save feedback')
    throw createError({ statusCode: 500, statusMessage: 'Failed to save feedback' })
  }
})
