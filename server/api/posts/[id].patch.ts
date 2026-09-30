import { Prisma } from '@prisma/client'

defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Edit a post',
    description:
      'Edits the body and/or visibility of the caller\'s own post. An omitted field is left unchanged; an omitted '
      + '`visibility` keeps the current one (the FRIENDS default applies to create only). Sets `editedAt` only when a value actually changes; '
      + 'a no-op edit returns the post unchanged. Anyone else\'s post is 404.',
    responses: {
      200: { description: 'Post' },
      400: { description: 'Nothing to update, body not 1–2000 characters, or invalid visibility' },
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

  const input = await readBody(event)
  if (input?.body === undefined && input?.visibility === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Provide body and/or visibility' })
  }
  const body = input.body === undefined ? undefined : parsePostBody(input.body)
  const visibility = input.visibility === undefined ? undefined : parseVisibility(input.visibility)

  const notFound = () => createError({ statusCode: 404, statusMessage: 'Post not found' })

  try {
    const post = await prisma.post.findUnique({ where: { id }, select: postSelect })
    if (!post || post.authorId !== userId) throw notFound()

    const changes: Prisma.PostUpdateInput = {}
    if (body !== undefined && body !== post.body) changes.body = body
    if (visibility !== undefined && visibility !== post.visibility) changes.visibility = visibility
    if (Object.keys(changes).length === 0) return toPost(post, userId)

    const updated = await prisma.post.update({
      where: { id },
      data: { ...changes, editedAt: new Date() },
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
