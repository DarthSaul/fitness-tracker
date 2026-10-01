defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Get a user profile',
    description:
      'Returns a public profile (id, name, avatar, profileVisibility — never email), the caller\'s follow state toward '
      + 'them (`outgoing`, `incoming`, and `incomingRequestId` while they have a pending request to the caller), and '
      + 'accepted follower/following counts. A PRIVATE profile is still returned; only its posts are gated. 404 if the '
      + 'user does not exist or a block exists in either direction; the two are indistinguishable.',
    responses: {
      200: { description: 'Public profile' },
      400: { description: 'Missing user id' },
      404: { description: 'User not found' },
      500: { description: 'Internal server error' },
    },
  },
})

type Profile = PublicUser & Relationship & { followerCount: number; followingCount: number }

export default defineEventHandler(async (event): Promise<Profile> => {
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

    const [states, followerCount, followingCount] = await Promise.all([
      followStatesWith(userId, [id]),
      prisma.follow.count({ where: { followeeId: id, status: 'ACCEPTED' } }),
      prisma.follow.count({ where: { followerId: id, status: 'ACCEPTED' } }),
    ])
    return { ...user, ...states.get(id)!, followerCount, followingCount }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/users/:id' }, '[GET /api/users/:id] Failed to fetch user')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch user' })
  }
})
