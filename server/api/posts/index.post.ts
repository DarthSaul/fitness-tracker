defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Create a post',
    description:
      "Creates a text post by the authenticated user. Who can see it follows the author's profile visibility "
      + '(PUBLIC: anyone not blocked; PRIVATE: accepted followers). Rate-limited to 30 posts per hour per user.',
    responses: {
      201: { description: 'Post created' },
      400: { description: 'body missing or not 1–2000 characters' },
      429: { description: 'Too many posts' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event): Promise<PostPayload> => {
  const userId = event.context.userId as string
  const input = await readBody(event)

  // Any `visibility` key from an older client is ignored: privacy is per profile.
  const body = parsePostBody(input?.body)

  try {
    await rateLimitByKey(`post-create:${userId}`, 30, '1 h')

    const post = await prisma.post.create({
      data: { authorId: userId, body },
      select: postSelect,
    })

    event.node.res.statusCode = 201
    return toPost(post, userId)
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/posts' }, '[POST /api/posts] Failed to create post')
    throw createError({ statusCode: 500, statusMessage: 'Failed to create post' })
  }
})
