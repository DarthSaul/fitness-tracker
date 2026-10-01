defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'List who reacted',
    description:
      'Who reacted to a post with one emoji, newest first, as public users with the caller\'s follow state toward each. '
      + 'Users blocked in either direction are left out, exactly as they are left out of the counts, so a count always '
      + 'matches this list. Paginated like GET /api/history: `limit` (default 20, clamped to 1–50), and for the next page '
      + 'the last row\'s `reactedAt` as `before` and its `cursorId` as `beforeId`.',
    parameters: [
      { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
      { name: 'before', in: 'query', required: false, schema: { type: 'string', format: 'date-time' }, description: '`reactedAt` of the last row from the previous page. Must be paired with `beforeId`.' },
      { name: 'beforeId', in: 'query', required: false, schema: { type: 'string' }, description: '`cursorId` of the last row from the previous page. Must be paired with `before`.' },
    ],
    responses: {
      200: { description: 'Reactors' },
      400: { description: 'Missing post id, not a single emoji, or invalid limit/before/beforeId' },
      404: { description: 'Post not found (or not visible to the caller)' },
      500: { description: 'Internal server error' },
    },
  },
})

type Reactor = PublicUser & Relationship & { reactedAt: Date; cursorId: string }

export default defineEventHandler(async (event): Promise<{ users: Reactor[] }> => {
  const userId = event.context.userId as string
  const postId = getRouterParam(event, 'id')?.trim()
  if (!postId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing post id' })
  }
  const emoji = parseReactionEmoji(getRouterParam(event, 'emoji', { decode: true }))
  const page = parsePageQuery(getQuery(event))

  try {
    await requireVisiblePost(postId, userId)

    // The same exclusion reactionSummaries applies to the counts.
    const blocked = await blockedUserIds(userId)
    const rows = await prisma.postReaction.findMany({
      where: {
        postId,
        emoji,
        ...(blocked.length > 0 ? { userId: { notIn: blocked } } : {}),
        ...pageWhere(page.before),
      },
      orderBy: newestFirst,
      take: page.limit,
      select: { id: true, createdAt: true, user: { select: publicUserSelect } },
    })

    const states = await followStatesWith(userId, rows.map((r) => r.user.id))
    return {
      users: rows.map((r) => ({ ...r.user, ...states.get(r.user.id)!, reactedAt: r.createdAt, cursorId: r.id })),
    }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/posts/:id/reactions/:emoji' }, '[GET /api/posts/:id/reactions/:emoji] Failed to fetch reactions')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch reactions' })
  }
})
