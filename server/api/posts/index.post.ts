import { Prisma } from '@prisma/client'

defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Create a post',
    description:
      "Creates a post by the authenticated user: `{ body?, photoIds?, workoutSessionId? | standaloneSessionId? }`. "
      + 'Up to 4 photos uploaded via POST /api/post-photos, attached in the given order. At most one of the caller\'s own '
      + 'COMPLETED workouts (ids from GET /api/history) may be shared, once per workout; only its program name is ever '
      + 'shown. Text may be empty only when there is a photo or a shared workout. '
      + "Who can see it follows the author's profile visibility (PUBLIC: anyone not blocked; PRIVATE: accepted "
      + 'followers). Rate-limited to 30 posts per hour per user.',
    responses: {
      201: { description: 'Post created' },
      400: { description: 'body missing or not 1–2000 characters (empty allowed with photos or a share); bad photoIds; a photo that is not the caller\'s own unattached upload; both session ids, or a blank one' },
      404: { description: 'Shared workout not found (or not the caller\'s own)' },
      409: { description: 'Shared workout is not completed, or is already shared' },
      429: { description: 'Too many posts' },
      500: { description: 'Internal server error' },
    },
  },
})

/**
 * The post's share snapshot, once the session is confirmed as the caller's own
 * and COMPLETED. Someone else's session is the same 404 as a missing one.
 * @throws {H3Error} 404, 409
 */
async function shareColumns(tx: Prisma.TransactionClient, share: WorkoutShareInput, userId: string) {
  const notFound = () => createError({ statusCode: 404, statusMessage: 'Workout not found' })
  const notCompleted = () => createError({ statusCode: 409, statusMessage: 'Workout is not completed' })

  if (share.kind === 'PROGRAM') {
    const session = await tx.workoutSession.findUnique({
      where: { id: share.sessionId },
      select: { userId: true, status: true, userProgram: { select: { program: { select: { name: true } } } } },
    })
    if (!session || session.userId !== userId) throw notFound()
    if (session.status !== 'COMPLETED') throw notCompleted()
    return { sharedWorkoutKind: share.kind, sharedProgramName: session.userProgram.program.name, workoutSessionId: share.sessionId }
  }

  const session = await tx.standaloneWorkoutSession.findUnique({ where: { id: share.sessionId }, select: { userId: true, status: true } })
  if (!session || session.userId !== userId) throw notFound()
  if (session.status !== 'COMPLETED') throw notCompleted()
  return { sharedWorkoutKind: share.kind, sharedProgramName: null, standaloneSessionId: share.sessionId }
}

export default defineEventHandler(async (event): Promise<PostPayload> => {
  const userId = event.context.userId as string
  const input = await readBody(event)

  // Any `visibility` key from an older client is ignored: privacy is per profile.
  const { body, photoIds, share } = parsePostContent(input)

  try {
    await rateLimitByKey(`post-create:${userId}`, 30, '1 h')

    const payload = await prisma.$transaction(async (tx) => {
      const shared = share ? await shareColumns(tx, share, userId) : {}
      // A session already shared fails the unique column (P2002, mapped below),
      // which also settles two concurrent shares of it without a lock.
      const { id } = await tx.post.create({ data: { authorId: userId, body, ...shared }, select: { id: true } })

      // Each attach is guarded on "the caller's own, not yet attached", so a
      // concurrent request attaching the same photo matches 0 rows and fails
      // (the row lock serializes them). Any failure rolls the post back too.
      for (const [position, photoId] of photoIds.entries()) {
        const { count } = await tx.postPhoto.updateMany({
          where: { id: photoId, uploaderId: userId, postId: null },
          data: { postId: id, position },
        })
        if (count === 0) {
          throw createError({ statusCode: 400, statusMessage: `Invalid photo: ${photoId}` })
        }
      }

      // The response (including signed photo URLs) is built BEFORE commit: if
      // signing fails, the post rolls back instead of existing behind a 500 —
      // which a retry couldn't recover, since its photos would already be attached.
      const post = (await tx.post.findUnique({ where: { id }, select: postSelect }))!
      const [built] = await toPostPayloads([post], userId)
      return built!
    })

    event.node.res.statusCode = 201
    return payload
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    // The only unique column a post create can hit is the shared session's.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Workout already shared' })
    }
    ;(event.context.logger ?? logger).error({ err: error, route: 'POST /api/posts' }, '[POST /api/posts] Failed to create post')
    throw createError({ statusCode: 500, statusMessage: 'Failed to create post' })
  }
})
