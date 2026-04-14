defineRouteMeta({
  openAPI: {
    tags: ['Feedback'],
    summary: 'Submit feedback',
    description: 'Saves a feedback entry from the authenticated user. Accepts multipart/form-data with an optional screenshot file.',
    responses: {
      201: { description: 'Feedback saved successfully' },
      400: { description: 'Missing or empty content' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  const parts = await readMultipartFormData(event)

  const contentPart = parts?.find((p) => p.name === 'content')
  const content = contentPart?.data?.toString('utf8')?.trim()

  if (!content) {
    throw createError({ statusCode: 400, statusMessage: 'Missing content' })
  }

  let screenshotUrl: string | null = null

  const filePart = parts?.find((p) => p.name === 'screenshot' && p.data?.length)
  if (filePart) {
    const filename = filePart.filename ?? `screenshot-${Date.now()}`
    const contentType = filePart.type ?? 'application/octet-stream'
    const storagePath = `${userId}/${Date.now()}-${filename}`

    const { data, error } = await supabase.storage
      .from('feedback-screenshots')
      .upload(storagePath, filePart.data, { contentType, upsert: false })

    if (error) {
      console.error('[POST /api/feedback] Screenshot upload failed', error)
      throw createError({ statusCode: 500, statusMessage: 'Failed to upload screenshot' })
    }

    screenshotUrl = supabase.storage
      .from('feedback-screenshots')
      .getPublicUrl(data.path).data.publicUrl
  }

  try {
    const feedback = await prisma.feedback.create({
      data: { userId, content, screenshotUrl },
    })

    event.node.res.statusCode = 201
    return feedback
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('[POST /api/feedback] Failed to save feedback', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save feedback' })
  }
})
