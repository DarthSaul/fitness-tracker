defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Follow a user',
    description:
      'Follows another user. A PUBLIC profile is followed at once (`{ status: "following" }`); a PRIVATE profile gets a '
      + 'request its owner must accept (`{ status: "requested", requestId }`). Idempotent: an existing follow or request '
      + 'returns 200 with its status. Rate-limited to 60 per hour per user.',
    responses: {
      201: { description: 'Followed, or request sent' },
      200: { description: 'Already following, or already requested' },
      400: { description: 'Missing userId, or following yourself' },
      404: { description: 'User not found' },
      429: { description: 'Too many follows' },
      500: { description: 'Internal server error' },
    },
  },
})

type FollowResponse = { status: 'following' } | { status: 'requested'; requestId: string }

const toResponse = (row: { id: string; status: 'PENDING' | 'ACCEPTED' }): FollowResponse =>
  row.status === 'ACCEPTED' ? { status: 'following' } : { status: 'requested', requestId: row.id }

export default defineEventHandler(async (event): Promise<FollowResponse> => {
  const userId = event.context.userId as string
  const body = await readBody(event)

  const targetId = typeof body?.userId === 'string' ? body.userId.trim() : ''
  if (!targetId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing userId' })
  }
  if (targetId === userId) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot follow yourself' })
  }

  const notFound = () => createError({ statusCode: 404, statusMessage: 'User not found' })

  try {
    await rateLimitByKey(`follow:${userId}`, 60, '1 h')

    // The pair lock serializes this with POST /api/blocks, so a block can't land
    // between the check and the write.
    return await withPairLock(userId, targetId, async (tx) => {
      // FOR SHARE serializes with PATCH /api/auth/me, which locks this row FOR
      // UPDATE before deciding to go public: either we wait and see PUBLIC, or
      // our PENDING row commits first and going public accepts it.
      const [target] = await tx.$queryRaw<{ profileVisibility: 'PUBLIC' | 'PRIVATE' }[]>`
        SELECT "profileVisibility"::text AS "profileVisibility" FROM "User" WHERE "id" = ${targetId} FOR SHARE`
      if (!target) throw notFound()
      if (await isBlockedEitherWay(userId, targetId, tx)) throw notFound()

      const existing = await tx.follow.findUnique({
        where: { followerId_followeeId: { followerId: userId, followeeId: targetId } },
        select: followSelect,
      })
      if (existing) return toResponse(existing)

      const isPublic = target.profileVisibility === 'PUBLIC'
      const created = await tx.follow.create({
        data: {
          followerId: userId,
          followeeId: targetId,
          status: isPublic ? 'ACCEPTED' : 'PENDING',
          acceptedAt: isPublic ? new Date() : null,
        },
        select: followSelect,
      })
      event.node.res.statusCode = 201
      return toResponse(created)
    })
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/following' }, '[POST /api/following] Failed to follow user')
    throw createError({ statusCode: 500, statusMessage: 'Failed to follow user' })
  }
})
