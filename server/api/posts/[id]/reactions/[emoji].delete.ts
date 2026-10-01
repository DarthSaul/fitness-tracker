defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Remove a reaction',
    description: "Removes the caller's own reaction with this emoji from a post they can see. Idempotent: 204 even if they hadn't reacted.",
    responses: {
      204: { description: 'Reaction removed (or was not there)' },
      400: { description: 'Missing post id, or not a single emoji' },
      404: { description: 'Post not found (or not visible to the caller)' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const postId = getRouterParam(event, 'id')?.trim()
  if (!postId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing post id' })
  }
  // Decoded and normalized like PUT, so a bare ❤ removes the stored ❤️.
  const emoji = parseReactionEmoji(getRouterParam(event, 'emoji', { decode: true }))

  try {
    await requireVisiblePost(postId, userId)
    // userId is always the caller: nobody can remove someone else's reaction.
    await prisma.postReaction.deleteMany({ where: { postId, userId, emoji } })
    event.node.res.statusCode = 204
    return null
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'DELETE /api/posts/:id/reactions/:emoji' }, '[DELETE /api/posts/:id/reactions/:emoji] Failed to remove reaction')
    throw createError({ statusCode: 500, statusMessage: 'Failed to remove reaction' })
  }
})
