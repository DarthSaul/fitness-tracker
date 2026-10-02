import { Prisma } from '@prisma/client'

defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'React to a post',
    description:
      'Adds the caller\'s reaction to a post they can see. `:emoji` is one URL-encoded emoji; a bare ❤ is stored as ❤️. '
      + 'Idempotent: 201 when new, 200 when the caller already had it. A user may add up to 10 different emoji to one '
      + 'post. Returns the post\'s reaction summaries. Rate-limited to 300 per hour per user.',
    responses: {
      201: { description: 'Reaction added — `{ reactions }`' },
      200: { description: 'Already reacted with this emoji — `{ reactions }`' },
      400: { description: 'Missing post id, or not a single emoji' },
      404: { description: 'Post not found (or not visible to the caller)' },
      409: { description: 'Already 10 different reactions on this post' },
      429: { description: 'Too many reactions' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event): Promise<{ reactions: ReactionSummary[] }> => {
  const userId = event.context.userId as string
  const postId = getRouterParam(event, 'id')?.trim()
  if (!postId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing post id' })
  }
  // h3 leaves route params percent-encoded unless asked to decode.
  const emoji = parseReactionEmoji(getRouterParam(event, 'emoji', { decode: true }))

  try {
    await rateLimitByKey(`react:${userId}`, 300, '1 h')
    const post = await requireVisiblePost(postId, userId)

    // Locked on (user, post) so two concurrent taps can't both pass the cap at
    // 9, or race the existence check. withPairLock's key is the sorted pair of
    // ids; a post id never equals a user id, so it can't contend with a
    // user-pair lock.
    const { created, notification } = await withPairLock(userId, postId, async (tx) => {
      const unchanged = { created: false, notification: null }
      const key = { postId_userId_emoji: { postId, userId, emoji } }
      if (await tx.postReaction.findUnique({ where: key, select: { id: true } })) return unchanged

      if ((await tx.postReaction.count({ where: { postId, userId } })) >= REACTION_CAP) {
        throw createError({ statusCode: 409, statusMessage: `At most ${REACTION_CAP} different reactions per post` })
      }
      try {
        await tx.postReaction.create({ data: { postId, userId, emoji } })
      } catch (err) {
        // Defence in depth: the lock serializes this user's writes on this post.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return unchanged
        throw err
      }
      // One notification per reactor per post, ever: the dedupe key ignores the
      // emoji, so more emoji (or un-react / re-react) never notify again.
      const notification = await notify(tx, {
        recipientId: post.author.id,
        actorId: userId,
        type: 'POST_REACTION',
        dedupeKey: notificationKeys.reaction(postId, userId),
        target: { postId },
        data: { emoji },
      })
      return { created: true, notification }
    })

    pushAfterCommit(event, notification)
    event.node.res.statusCode = created ? 201 : 200
    const summaries = await reactionSummaries([postId], userId)
    return { reactions: summaries.get(postId) ?? [] }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'PUT /api/posts/:id/reactions/:emoji' }, '[PUT /api/posts/:id/reactions/:emoji] Failed to add reaction')
    throw createError({ statusCode: 500, statusMessage: 'Failed to add reaction' })
  }
})
