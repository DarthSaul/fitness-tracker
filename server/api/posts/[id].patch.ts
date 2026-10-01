import { Prisma } from '@prisma/client'

defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Edit a post',
    description:
      'Edits the body of the caller\'s own post (photos are fixed once posted; a photo post\'s text may be emptied). '
      + 'Sets `editedAt` only when the body actually changes; a no-op edit returns the post unchanged. Anyone else\'s post is 404.',
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

  // Only `body` is editable: `visibility` (privacy is per profile) and
  // `photoIds` (photos are fixed once posted) keys are ignored.
  const raw = (await readBody(event))?.body
  // Shape and length now; whether empty is allowed depends on the post's photos.
  parsePostBody(raw, { allowEmpty: true })

  const notFound = () => createError({ statusCode: 404, statusMessage: 'Post not found' })

  try {
    const post = await prisma.post.findUnique({ where: { id }, select: postSelect })
    if (!post || post.authorId !== userId) throw notFound()

    // A photo post may have no text; a text-only post must keep some.
    const body = parsePostBody(raw, { allowEmpty: post.photos.length > 0 })
    if (body === post.body) return (await toPostPayloads([post], userId))[0]!

    const updated = await prisma.post.update({
      where: { id },
      data: { body, editedAt: new Date() },
      select: postSelect,
    })
    return (await toPostPayloads([updated], userId))[0]!
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw notFound()
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'PATCH /api/posts/:id' }, '[PATCH /api/posts/:id] Failed to update post')
    throw createError({ statusCode: 500, statusMessage: 'Failed to update post' })
  }
})
