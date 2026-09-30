defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Create a post',
    description:
      'Creates a text post by the authenticated user. `visibility` is `PUBLIC` or `FRIENDS`, defaulting to `FRIENDS` when '
      + 'omitted. Rate-limited to 30 posts per hour per user.',
    responses: {
      201: { description: 'Post created' },
      400: { description: 'body missing or not 1–2000 characters, or invalid visibility' },
      429: { description: 'Too many posts' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event): Promise<PostPayload> => {
  const userId = event.context.userId as string
  const input = await readBody(event)

  const body = parsePostBody(input?.body)
  // Omitted means FRIENDS: sharing publicly is always an explicit choice.
  const visibility = input?.visibility === undefined ? 'FRIENDS' : parseVisibility(input.visibility)

  try {
    await rateLimitByKey(`post-create:${userId}`, 30, '1 h')

    const post = await prisma.post.create({
      data: { authorId: userId, body, visibility },
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
