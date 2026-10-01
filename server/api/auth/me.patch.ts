import type { Prisma } from '@prisma/client'

const meSelect = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  ptRoutineInWorkout: true,
  profileVisibility: true,
} satisfies Prisma.UserSelect

defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Update current user settings',
    description: 'Updates the authenticated user\'s profile settings. Send at least one of: `ptRoutineInWorkout` (whether PT routines are shown in the active workout view) and `profileVisibility` (`PUBLIC` or `PRIVATE` — who can see the user\'s posts). Switching from PRIVATE to PUBLIC accepts every pending follow request.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              ptRoutineInWorkout: { type: 'boolean', example: true },
              profileVisibility: { type: 'string', enum: ['PUBLIC', 'PRIVATE'] },
            },
          },
        },
      },
    },
    responses: {
      200: { description: 'Updated user profile' },
      400: { description: 'Missing or invalid fields' },
      401: { description: 'Unauthorized' },
      404: { description: 'User not found' },
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
    const body = rawBody as { ptRoutineInWorkout?: unknown; profileVisibility?: unknown }

    if (!('ptRoutineInWorkout' in body) && !('profileVisibility' in body)) {
      throw createError({ statusCode: 400, statusMessage: 'Provide ptRoutineInWorkout and/or profileVisibility' })
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

    // One transaction that locks the user row FOR UPDATE before deciding
    // anything, so overlapping PATCHes from the same user serialize and each
    // decides `goingPublic` from the committed state. It also serializes with
    // POST /api/following, which reads this row FOR SHARE: a concurrent follow
    // either waits and sees PUBLIC (created accepted), or commits its PENDING
    // row first and is accepted by the updateMany below.
    return await prisma.$transaction(async (tx) => {
      const [current] = await tx.$queryRaw<{ profileVisibility: 'PUBLIC' | 'PRIVATE' }[]>`
        SELECT "profileVisibility"::text AS "profileVisibility" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
      if (!current) {
        throw createError({ statusCode: 404, statusMessage: 'User not found' })
      }

      const updated = await tx.user.update({ where: { id: userId }, data, select: meSelect })

      // Going public: anyone can now follow instantly, so pending requests are accepted too.
      if (current.profileVisibility === 'PRIVATE' && data.profileVisibility === 'PUBLIC') {
        await tx.follow.updateMany({
          where: { followeeId: userId, status: 'PENDING' },
          data: { status: 'ACCEPTED', acceptedAt: new Date() },
        })
      }
      return updated
    })
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'PATCH /api/auth/me' }, '[PATCH /api/auth/me] Failed to update current user')
    throw createError({ statusCode: 500, statusMessage: 'Failed to update current user' })
  }
})
