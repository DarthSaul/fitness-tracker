import { Prisma } from '@prisma/client'

defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Block a user',
    description:
      'Blocks another user and ends any friendship or pending request between them. Each user is then hidden from the other everywhere in the social API, and the blocked '
      + 'user is never told. Idempotent: blocking an already-blocked user returns the existing block with 200.',
    responses: {
      201: { description: 'User blocked' },
      200: { description: 'User was already blocked' },
      400: { description: 'Missing userId, or attempting to block yourself' },
      404: { description: 'User not found' },
      500: { description: 'Internal server error' },
    },
  },
})

const blockSelect = { blockedId: true, createdAt: true } satisfies Prisma.UserBlockSelect

interface BlockResponse { userId: string; blockedAt: Date }

export default defineEventHandler(async (event): Promise<BlockResponse> => {
  const userId = event.context.userId as string
  const body = await readBody(event)

  const targetId = typeof body?.userId === 'string' ? body.userId.trim() : ''
  if (!targetId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing userId' })
  }
  if (targetId === userId) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot block yourself' })
  }

  const where = { blockerId_blockedId: { blockerId: userId, blockedId: targetId } }
  const toResponse = (b: { blockedId: string; createdAt: Date }): BlockResponse => ({ userId: b.blockedId, blockedAt: b.createdAt })

  try {
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } })
    if (!target) {
      throw createError({ statusCode: 404, statusMessage: 'User not found' })
    }

    const existing = await prisma.userBlock.findUnique({ where, select: blockSelect })
    if (existing) return toResponse(existing)

    try {
      // A block severs the pair's friendship or pending request, atomically, so
      // "blocked" and "friends" can never both be true.
      const [block] = await prisma.$transaction([
        prisma.userBlock.create({
          data: { blockerId: userId, blockedId: targetId },
          select: blockSelect,
        }),
        prisma.friendship.deleteMany({ where: orderedPair(userId, targetId) }),
      ])
      event.node.res.statusCode = 201
      return toResponse(block)
    } catch (createErr) {
      // A concurrent request created the same block between our read and write.
      if (createErr instanceof Prisma.PrismaClientKnownRequestError && createErr.code === 'P2002') {
        const raced = await prisma.userBlock.findUnique({ where, select: blockSelect })
        if (raced) return toResponse(raced)
      }
      throw createErr
    }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/blocks' }, '[POST /api/blocks] Failed to block user')
    throw createError({ statusCode: 500, statusMessage: 'Failed to block user' })
  }
})
