defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'List pending follow requests',
    description: 'Pending follow requests the caller received (`incoming`, the default) or sent (`outgoing`), newest first.',
    parameters: [{ name: 'direction', in: 'query', required: false, schema: { type: 'string', enum: ['incoming', 'outgoing'], default: 'incoming' } }],
    responses: {
      200: { description: 'Pending requests' },
      400: { description: 'Invalid direction' },
      500: { description: 'Internal server error' },
    },
  },
})

interface FollowRequestResponse {
  id: string
  user: PublicUser
  direction: 'incoming' | 'outgoing'
  createdAt: Date
}

export default defineEventHandler(async (event): Promise<{ requests: FollowRequestResponse[] }> => {
  const userId = event.context.userId as string

  const direction = getQuery(event).direction ?? 'incoming'
  if (direction !== 'incoming' && direction !== 'outgoing') {
    throw createError({ statusCode: 400, statusMessage: 'direction must be incoming or outgoing' })
  }

  const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }]

  try {
    if (direction === 'incoming') {
      const rows = await prisma.follow.findMany({
        where: { followeeId: userId, status: 'PENDING' },
        orderBy,
        select: { id: true, createdAt: true, follower: { select: publicUserSelect } },
      })
      return { requests: rows.map((r) => ({ id: r.id, user: r.follower, direction, createdAt: r.createdAt })) }
    }

    const rows = await prisma.follow.findMany({
      where: { followerId: userId, status: 'PENDING' },
      orderBy,
      select: { id: true, createdAt: true, followee: { select: publicUserSelect } },
    })
    return { requests: rows.map((r) => ({ id: r.id, user: r.followee, direction, createdAt: r.createdAt })) }
  } catch (error) {
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/follow-requests' }, '[GET /api/follow-requests] Failed to fetch follow requests')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch follow requests' })
  }
})
