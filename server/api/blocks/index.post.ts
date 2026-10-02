import type { Prisma } from '@prisma/client'

defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Block a user',
    description:
      'Blocks another user and removes any follows or follow requests between them, in both directions. Each user is then hidden from the other everywhere in the social API, and the blocked '
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

    // Serialized with follow writes on the same pair (see withPairLock), so no
    // follow or request can slip in between this block and the cleanup below —
    // "blocked" and "following / requested" can never both be true.
    const { block, created } = await withPairLock(userId, targetId, async (tx) => {
      const existing = await tx.userBlock.findUnique({ where, select: blockSelect })
      if (existing) return { block: existing, created: false }

      const block = await tx.userBlock.create({ data: { blockerId: userId, blockedId: targetId }, select: blockSelect })
      await tx.follow.deleteMany({
        where: {
          OR: [
            { followerId: userId, followeeId: targetId },
            { followerId: targetId, followeeId: userId },
          ],
        },
      })
      // Neither inbox may keep anything that reveals the other user.
      await clearNotificationsBetween(tx, userId, targetId)
      return { block, created: true }
    })

    if (created) event.node.res.statusCode = 201
    return toResponse(block)
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/blocks' }, '[POST /api/blocks] Failed to block user')
    throw createError({ statusCode: 500, statusMessage: 'Failed to block user' })
  }
})
