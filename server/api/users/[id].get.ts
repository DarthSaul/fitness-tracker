defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Get a user profile',
    description: 'Returns a public profile (id, name, avatar — never email) and the caller\'s `relationship` to them, with `requestId` while a request is pending. 404 if the user does not exist or a block exists in either direction; the two are indistinguishable.',
    responses: {
      200: { description: 'Public profile' },
      400: { description: 'Missing user id' },
      404: { description: 'User not found' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event): Promise<PublicUser & Relationship> => {
  const userId = event.context.userId as string
  const id = getRouterParam(event, 'id')?.trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing user id' })
  }

  try {
    const user = await prisma.user.findUnique({ where: { id }, select: publicUserSelect })
    if (!user || (await isBlockedEitherWay(userId, id))) {
      throw createError({ statusCode: 404, statusMessage: 'User not found' })
    }
    const relationship = (await relationshipsWith(userId, [id])).get(id)!
    return { ...user, ...relationship }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/users/:id' }, '[GET /api/users/:id] Failed to fetch user')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch user' })
  }
})
