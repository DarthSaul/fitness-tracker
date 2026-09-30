import { Prisma } from '@prisma/client'

defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Accept a friend request',
    description: 'Accepts a pending request sent to the caller. Only the recipient can accept; anything else is 404.',
    responses: {
      200: { description: 'Accepted — `{ friend }`' },
      400: { description: 'Missing request id' },
      404: { description: 'Friend request not found' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event): Promise<{ friend: Friend }> => {
  const userId = event.context.userId as string
  const id = getRouterParam(event, 'id')?.trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing request id' })
  }

  const notFound = () => createError({ statusCode: 404, statusMessage: 'Friend request not found' })

  try {
    const row = await prisma.friendship.findUnique({
      where: { id },
      select: {
        ...friendshipSelect,
        userLowId: true,
        userHighId: true,
        userLow: { select: publicUserSelect },
        userHigh: { select: publicUserSelect },
      },
    })
    const isRecipient = row && row.requesterId !== userId && (row.userLowId === userId || row.userHighId === userId)
    if (!row || row.status !== 'PENDING' || !isRecipient) throw notFound()

    const accepted = await prisma.friendship.update({
      // Guarded on PENDING so a request cancelled mid-flight fails (P2025) instead of reviving.
      where: { id, status: 'PENDING' },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
      select: friendshipSelect,
    })

    const requester = row.userLowId === userId ? row.userHigh : row.userLow
    return { friend: { ...requester, friendsSince: accepted.acceptedAt! } }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw notFound()
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/friend-requests/:id/accept' }, '[POST /api/friend-requests/:id/accept] Failed to accept friend request')
    throw createError({ statusCode: 500, statusMessage: 'Failed to accept friend request' })
  }
})
