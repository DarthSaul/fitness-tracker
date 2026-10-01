defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Get my feed',
    description:
      "The caller's own posts plus the posts of everyone they follow (accepted follows only), newest first. Pending "
      + 'requests and PUBLIC profiles the caller does not follow are not included. Unfollowing, or being removed as a '
      + 'follower, drops that user\'s posts from the next fetch. Paginated exactly like GET /api/history: `limit` '
      + '(default 20, clamped to 1–50) and `before` + `beforeId` from the last post of the previous page; a page '
      + 'shorter than `limit` is the end.',
    parameters: [
      { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
      { name: 'before', in: 'query', required: false, schema: { type: 'string', format: 'date-time' }, description: 'createdAt of the last post from the previous page. Must be paired with `beforeId`.' },
      { name: 'beforeId', in: 'query', required: false, schema: { type: 'string' }, description: 'id of the last post from the previous page. Must be paired with `before`.' },
    ],
    responses: {
      200: { description: 'Feed posts' },
      400: { description: 'Invalid limit, before, or beforeId' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event): Promise<{ posts: PostPayload[] }> => {
  const userId = event.context.userId as string
  const page = parsePageQuery(getQuery(event))

  try {
    // The author list is the visibility rule applied wholesale: the caller, plus
    // accepted followees — whom the caller may see whatever their profile
    // visibility. A block deletes follows both ways (under the pair lock), so
    // no blocked user can be in it, and no further filter is needed.
    const authorIds = [userId, ...(await followingIdsOf(userId))]

    const posts = await prisma.post.findMany({
      where: { authorId: { in: authorIds }, ...pageWhere(page.before) },
      orderBy: newestFirst,
      take: page.limit,
      select: postSelect,
    })

    return { posts: posts.map((p) => toPost(p, userId)) }
  } catch (error) {
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/feed' }, '[GET /api/feed] Failed to fetch feed')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch feed' })
  }
})
