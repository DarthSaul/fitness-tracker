import { Prisma } from '@prisma/client'

const FIELDS = ['ptRoutineInWorkout', 'profileVisibility', 'username', 'bio', 'showActiveProgram', 'showWorkoutCount'] as const
const BOOLEAN_FIELDS = ['showActiveProgram', 'showWorkoutCount'] as const

defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Update current user settings',
    description: 'Updates the authenticated user\'s profile settings. Send at least one of: `ptRoutineInWorkout` (whether PT routines are shown in the active workout view) `profileVisibility` (`PUBLIC` or `PRIVATE` — who can see the user\'s posts), `username` (3–30 of a–z, 0–9, "_" and "."; stored lowercase, a leading "@" dropped; unique), `bio` (up to 100 code points; blank or null clears it), and `showActiveProgram` / `showWorkoutCount` (whether people who can see the user\'s posts also see their active program\'s name and completed workout count on the profile; both default to true). Switching from PRIVATE to PUBLIC accepts every pending follow request.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              ptRoutineInWorkout: { type: 'boolean', example: true },
              profileVisibility: { type: 'string', enum: ['PUBLIC', 'PRIVATE'] },
              username: { type: 'string', example: 'saulg' },
              bio: { type: 'string', nullable: true, example: 'Lifting since 2010' },
              showActiveProgram: { type: 'boolean', example: true },
              showWorkoutCount: { type: 'boolean', example: true },
            },
          },
        },
      },
    },
    responses: {
      200: { description: 'The updated profile: the same fields as GET /api/auth/me (id, email, name, avatarUrl, ptRoutineInWorkout, profileVisibility, username, bio, showActiveProgram, showWorkoutCount)' },
      400: { description: 'Missing or invalid fields, or a reserved username' },
      401: { description: 'Unauthorized' },
      404: { description: 'User not found' },
      409: { description: 'Username taken' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  try {
    const rawBody = (await readBody(event)) ?? {}
    if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
    }
    const body = rawBody as Partial<Record<(typeof FIELDS)[number], unknown>>

    if (!FIELDS.some((field) => field in body)) {
      throw createError({ statusCode: 400, statusMessage: `Provide at least one of ${FIELDS.join(', ')}` })
    }
    const data: Prisma.UserUpdateInput = {}
    if ('ptRoutineInWorkout' in body) {
      if (typeof body.ptRoutineInWorkout !== 'boolean') {
        throw createError({ statusCode: 400, statusMessage: 'ptRoutineInWorkout must be a boolean' })
      }
      data.ptRoutineInWorkout = body.ptRoutineInWorkout
    }
    if ('profileVisibility' in body) {
      if (body.profileVisibility !== 'PUBLIC' && body.profileVisibility !== 'PRIVATE') {
        throw createError({ statusCode: 400, statusMessage: 'profileVisibility must be PUBLIC or PRIVATE' })
      }
      data.profileVisibility = body.profileVisibility
    }
    // Every account has a username, so it can be changed but not cleared.
    if ('username' in body) data.username = parseUsername(body.username)
    if ('bio' in body) data.bio = parseBio(body.bio)
    for (const field of BOOLEAN_FIELDS) {
      if (!(field in body)) continue
      const value = body[field]
      if (typeof value !== 'boolean') {
        throw createError({ statusCode: 400, statusMessage: `${field} must be a boolean` })
      }
      data[field] = value
    }

    // One transaction that locks the user row FOR UPDATE before deciding
    // anything, so overlapping PATCHes from the same user serialize and each
    // decides `goingPublic` from the committed state. It also serializes with
    // POST /api/following, which reads this row FOR SHARE: a concurrent follow
    // either waits and sees PUBLIC (created accepted), or commits its PENDING
    // row first and is accepted by the updateMany below.
    const { updated, notifications } = await prisma.$transaction(async (tx) => {
      const [current] = await tx.$queryRaw<{ profileVisibility: 'PUBLIC' | 'PRIVATE' }[]>`
        SELECT "profileVisibility"::text AS "profileVisibility" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
      if (!current) {
        throw createError({ statusCode: 404, statusMessage: 'User not found' })
      }

      const updated = await tx.user.update({ where: { id: userId }, data, select: meSelect })

      // Going public: anyone can now follow instantly, so pending requests are accepted too.
      if (current.profileVisibility !== 'PRIVATE' || data.profileVisibility !== 'PUBLIC') {
        return { updated, notifications: [] }
      }
      // updateManyAndReturn yields exactly the rows it accepted, so a request
      // cancelled mid-flight is never announced as accepted.
      const accepted = await tx.follow.updateManyAndReturn({
        where: { followeeId: userId, status: 'PENDING' },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
        select: { id: true, followerId: true },
      })
      if (accepted.length === 0) return { updated, notifications: [] }

      // Batched: one statement each, however many requests were waiting.
      await retract(tx, { followId: { in: accepted.map((f) => f.id) } })
      const notifications = await notifyEach(tx, userId, accepted.map((f) => ({
        recipientId: f.followerId,
        type: 'FOLLOW_ACCEPTED' as const,
        dedupeKey: notificationKeys.followAccepted(f.id),
      })))
      return { updated, notifications }
    })

    pushAfterCommit(event, notifications)
    return updated
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    // The only unique column this update can write is username.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Username taken' })
    }
    ;(event.context.logger ?? logger).error({ err: error, route: 'PATCH /api/auth/me' }, '[PATCH /api/auth/me] Failed to update current user')
    throw createError({ statusCode: 500, statusMessage: 'Failed to update current user' })
  }
})
