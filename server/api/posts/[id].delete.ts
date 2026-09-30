defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Delete a post',
    description: "Permanently deletes the caller's own post. Anyone else's post is 404.",
    responses: {
      204: { description: 'Post deleted' },
      400: { description: 'Missing post id' },
      404: { description: 'Post not found' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const id = getRouterParam(event, 'id')?.trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing post id' })
  }

  try {
    // Ownership is part of the WHERE, so the check and the delete are one query.
    const { count } = await prisma.post.deleteMany({ where: { id, authorId: userId } })
    if (count === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Post not found' })
    }

    event.node.res.statusCode = 204
    return null
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'DELETE /api/posts/:id' }, '[DELETE /api/posts/:id] Failed to delete post')
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete post' })
  }
})
