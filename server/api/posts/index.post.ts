defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Create a post',
    description:
      "Creates a post by the authenticated user: `{ body?, photoIds? }`. Up to 4 photos uploaded via "
      + 'POST /api/post-photos, attached in the given order; text may be empty only when there is at least one photo. '
      + "Who can see it follows the author's profile visibility (PUBLIC: anyone not blocked; PRIVATE: accepted "
      + 'followers). Rate-limited to 30 posts per hour per user.',
    responses: {
      201: { description: 'Post created' },
      400: { description: 'body missing or not 1–2000 characters (empty allowed with photos); bad photoIds; a photo that is not the caller\'s own unattached upload' },
      429: { description: 'Too many posts' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event): Promise<PostPayload> => {
  const userId = event.context.userId as string
  const input = await readBody(event)

  // Any `visibility` key from an older client is ignored: privacy is per profile.
  const { body, photoIds } = parsePostContent(input)

  try {
    await rateLimitByKey(`post-create:${userId}`, 30, '1 h')

    const payload = await prisma.$transaction(async (tx) => {
      const { id } = await tx.post.create({ data: { authorId: userId, body }, select: { id: true } })

      // Each attach is guarded on "the caller's own, not yet attached", so a
      // concurrent request attaching the same photo matches 0 rows and fails
      // (the row lock serializes them). Any failure rolls the post back too.
      for (const [position, photoId] of photoIds.entries()) {
        const { count } = await tx.postPhoto.updateMany({
          where: { id: photoId, uploaderId: userId, postId: null },
          data: { postId: id, position },
        })
        if (count === 0) {
          throw createError({ statusCode: 400, statusMessage: `Invalid photo: ${photoId}` })
        }
      }

      // The response (including signed photo URLs) is built BEFORE commit: if
      // signing fails, the post rolls back instead of existing behind a 500 —
      // which a retry couldn't recover, since its photos would already be attached.
      const post = (await tx.post.findUnique({ where: { id }, select: postSelect }))!
      const [built] = await toPostPayloads([post], userId)
      return built!
    })

    event.node.res.statusCode = 201
    return payload
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/posts' }, '[POST /api/posts] Failed to create post')
    throw createError({ statusCode: 500, statusMessage: 'Failed to create post' })
  }
})
