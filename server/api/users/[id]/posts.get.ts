import type { Prisma } from '@prisma/client'

defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: "List a user's posts",
    description:
      "The user's posts the caller may see, newest first: all of them for the caller's own profile; PUBLIC and FRIENDS "
      + 'for a current friend; PUBLIC only otherwise. 404 if the user does not exist or a block exists either way. '
      + 'Paginated exactly like GET /api/history: `limit` (default 20, clamped to 1–50) and `before` + `beforeId` from '
      + 'the last post of the previous page; a page shorter than `limit` is the end.',
    parameters: [
      { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
      { name: 'before', in: 'query', required: false, schema: { type: 'string', format: 'date-time' }, description: 'createdAt of the last post from the previous page. Must be paired with `beforeId`.' },
      { name: 'beforeId', in: 'query', required: false, schema: { type: 'string' }, description: 'id of the last post from the previous page. Must be paired with `before`.' },
    ],
    responses: {
      200: { description: 'Posts' },
      400: { description: 'Missing user id, or invalid limit, before, or beforeId' },
      404: { description: 'User not found' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event): Promise<{ posts: PostPayload[] }> => {
  const userId = event.context.userId as string
  const authorId = getRouterParam(event, 'id')?.trim()
  if (!authorId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing user id' })
  }
  const page = parsePageQuery(getQuery(event))

  try {
    const author = await prisma.user.findUnique({ where: { id: authorId }, select: { id: true } })
    const isSelf = authorId === userId
    if (!author || (!isSelf && (await isBlockedEitherWay(userId, authorId)))) {
      throw createError({ statusCode: 404, statusMessage: 'User not found' })
    }

    // canViewPost applied to a whole author at once: with the block ruled out,
    // the only remaining question is whether FRIENDS posts are included.
    const visibility: Prisma.PostWhereInput = isSelf || (await areFriends(userId, authorId)) ? {} : { visibility: 'PUBLIC' }

    const posts = await prisma.post.findMany({
      where: { authorId, ...visibility, ...pageWhere(page.before) },
      orderBy: newestFirst,
      take: page.limit,
      select: postSelect,
    })

    return { posts: posts.map((p) => toPost(p, userId)) }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/users/:id/posts' }, "[GET /api/users/:id/posts] Failed to fetch user's posts")
    throw createError({ statusCode: 500, statusMessage: "Failed to fetch user's posts" })
  }
})
