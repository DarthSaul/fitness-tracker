import { Prisma } from '@prisma/client'

defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Edit a post',
    description:
      'Edits the body of the caller\'s own post. Sets `editedAt` only when the body actually changes; a no-op edit '
      + 'returns the post unchanged. Anyone else\'s post is 404.',
    responses: {
      200: { description: 'Post' },
      400: { description: 'body missing or not 1–2000 characters' },
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

  // Any `visibility` key from an older client is ignored: privacy is per profile.
  const body = parsePostBody((await readBody(event))?.body)

  const notFound = () => createError({ statusCode: 404, statusMessage: 'Post not found' })

  try {
    const post = await prisma.post.findUnique({ where: { id }, select: postSelect })
    if (!post || post.authorId !== userId) throw notFound()

    if (body === post.body) return toPost(post, userId)

    const updated = await prisma.post.update({
      where: { id },
      data: { body, editedAt: new Date() },
      select: postSelect,
    })
    return toPost(updated, userId)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw notFound()
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'PATCH /api/posts/:id' }, '[PATCH /api/posts/:id] Failed to update post')
    throw createError({ statusCode: 500, statusMessage: 'Failed to update post' })
  }
})
