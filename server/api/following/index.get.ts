defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'List who I follow',
    description: "Users the caller follows (accepted only), newest first. Only the caller's own list is available.",
    responses: {
      200: { description: 'Followed users' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event): Promise<{ users: (PublicUser & { since: Date })[] }> => {
  const userId = event.context.userId as string

  try {
    const rows = await prisma.follow.findMany({
      where: { followerId: userId, status: 'ACCEPTED' },
      orderBy: [{ acceptedAt: 'desc' }, { id: 'desc' }],
      select: { acceptedAt: true, followee: { select: publicUserSelect } },
    })
    return { users: rows.map((r) => ({ ...r.followee, since: r.acceptedAt! })) }
  } catch (error) {
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/following' }, '[GET /api/following] Failed to fetch following')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch following' })
  }
})
