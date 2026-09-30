import type { Prisma } from '@prisma/client'

defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'List pending friend requests',
    description: 'Pending friend requests the caller received (`incoming`, the default) or sent (`outgoing`), newest first.',
    parameters: [{ name: 'direction', in: 'query', required: false, schema: { type: 'string', enum: ['incoming', 'outgoing'], default: 'incoming' } }],
    responses: {
      200: { description: 'Pending requests' },
      400: { description: 'Invalid direction' },
      500: { description: 'Internal server error' },
    },
  },
})

const DIRECTIONS = ['incoming', 'outgoing'] as const
type Direction = (typeof DIRECTIONS)[number]

export default defineEventHandler(async (event): Promise<{ requests: FriendRequestResponse[] }> => {
  const userId = event.context.userId as string

  const raw = getQuery(event).direction ?? 'incoming'
  if (typeof raw !== 'string' || !DIRECTIONS.includes(raw as Direction)) {
    throw createError({ statusCode: 400, statusMessage: 'direction must be incoming or outgoing' })
  }
  const direction = raw as Direction

  const where: Prisma.FriendshipWhereInput = direction === 'outgoing'
    ? { status: 'PENDING', requesterId: userId }
    : { status: 'PENDING', requesterId: { not: userId }, OR: [{ userLowId: userId }, { userHighId: userId }] }

  try {
    const rows = await prisma.friendship.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { ...friendshipSelect, userLow: { select: publicUserSelect }, userHigh: { select: publicUserSelect } },
    })

    return {
      requests: rows.map((r) => ({
        id: r.id,
        user: r.userLow.id === userId ? r.userHigh : r.userLow,
        direction,
        createdAt: r.createdAt,
      })),
    }
  } catch (error) {
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/friend-requests' }, '[GET /api/friend-requests] Failed to fetch friend requests')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch friend requests' })
  }
})
