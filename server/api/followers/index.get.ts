defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'List my followers',
    description: "The caller's accepted followers, newest first. Pending requests are at GET /api/follow-requests. Only the caller's own list is available.",
    responses: {
      200: { description: 'Followers' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event): Promise<{ users: (PublicUser & { since: Date })[] }> => {
  const userId = event.context.userId as string

  try {
    const rows = await prisma.follow.findMany({
      where: { followeeId: userId, status: 'ACCEPTED' },
      orderBy: [{ acceptedAt: 'desc' }, { id: 'desc' }],
      select: { acceptedAt: true, follower: { select: publicUserSelect } },
    })
    return { users: rows.map((r) => ({ ...r.follower, since: r.acceptedAt! })) }
  } catch (error) {
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/followers' }, '[GET /api/followers] Failed to fetch followers')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch followers' })
  }
})
