defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'List friends',
    description: "The caller's accepted friends, ordered by name (case-insensitive; users without a name last). Nobody can list another user's friends.",
    responses: {
      200: { description: 'Friends' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event): Promise<{ friends: Friend[] }> => {
  const userId = event.context.userId as string

  try {
    const rows = await prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ userLowId: userId }, { userHighId: userId }] },
      select: { acceptedAt: true, userLow: { select: publicUserSelect }, userHigh: { select: publicUserSelect } },
    })

    // Sorted here because the friend is on a different side of each row, so the
    // database can't order by "the other user's name".
    const friends: Friend[] = rows
      .map((r) => ({ ...(r.userLow.id === userId ? r.userHigh : r.userLow), friendsSince: r.acceptedAt! }))
      .sort((a, b) =>
        Number(a.name === null) - Number(b.name === null)
        || (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' })
        || a.id.localeCompare(b.id))

    return { friends }
  } catch (error) {
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/friends' }, '[GET /api/friends] Failed to fetch friends')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch friends' })
  }
})
