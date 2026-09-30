defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Get a post',
    description:
      'Returns a post the caller may see: their own; or, with no block either way, a PUBLIC post or a FRIENDS post by a '
      + 'current friend. Anything else is 404, indistinguishable from a post that does not exist.',
    responses: {
      200: { description: 'Post' },
      400: { description: 'Missing post id' },
      404: { description: 'Post not found' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event): Promise<PostPayload> => {
  const userId = event.context.userId as string
  const id = getRouterParam(event, 'id')?.trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing post id' })
  }

  try {
    const post = await prisma.post.findUnique({ where: { id }, select: postSelect })
    if (!post || !(await canViewPost(userId, post))) {
      throw createError({ statusCode: 404, statusMessage: 'Post not found' })
    }
    return toPost(post, userId)
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/posts/:id' }, '[GET /api/posts/:id] Failed to fetch post')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch post' })
  }
})
