defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'List blocked users',
    description: 'Lists the users the authenticated user has blocked, newest first. Blocks made against the caller are never listed.',
    responses: {
      200: { description: 'Blocked users' },
      500: { description: 'Internal server error' },
    },
  },
})

type BlockedUser = PublicUser & { blockedAt: Date }

export default defineEventHandler(async (event): Promise<{ users: BlockedUser[] }> => {
  const userId = event.context.userId as string

  try {
    const blocks = await prisma.userBlock.findMany({
      where: { blockerId: userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { createdAt: true, blocked: { select: publicUserSelect } },
    })

    return { users: blocks.map((b) => ({ ...b.blocked, blockedAt: b.createdAt })) }
  } catch (error) {
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/blocks' }, '[GET /api/blocks] Failed to fetch blocked users')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch blocked users' })
  }
})
