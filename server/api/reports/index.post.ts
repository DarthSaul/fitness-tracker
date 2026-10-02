import { Prisma } from '@prisma/client'
import * as Sentry from '@sentry/nuxt'

defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Report a post or user',
    description:
      'Reports a post the caller can see, or another user, for moderation: `{ postId | userId, reason, details? }`. '
      + '`reason` is one of SPAM, HARASSMENT, HATE, SEXUAL_CONTENT, VIOLENCE, SELF_HARM, IMPERSONATION, OTHER; '
      + '`details` is optional, up to 1000 characters. What was reported is snapshotted, so editing or deleting it '
      + 'does not erase the report. Reporting the same target again is a no-op that returns the first report. '
      + 'Rate-limited to 20 reports per hour per user.',
    responses: {
      201: { description: 'Report created — `{ id }`' },
      200: { description: 'Already reported by the caller — `{ id }` of the first report' },
      400: { description: 'Not exactly one of postId/userId, an unknown reason, details over 1000 characters, or yourself / your own post' },
      404: { description: 'Post not found (or not visible to the caller), or user not found (or has blocked the caller)' },
      429: { description: 'Too many reports' },
      500: { description: 'Internal server error' },
    },
  },
})

/** The row to create (minus reason/details), and how to find a prior report of the same target. */
type ReportDraft = {
  row: Omit<Prisma.ReportUncheckedCreateInput, 'reason' | 'details'>
  existing: Prisma.ReportWhereInput
}

/** The report row for a post the reporter can see. @throws {H3Error} 400, 404 */
async function postDraft(postId: string, reporterId: string): Promise<ReportDraft> {
  await requireVisiblePost(postId, reporterId)
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true, body: true, sharedWorkoutKind: true, _count: { select: { photos: true } } },
  })
  if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  if (post.authorId === reporterId) throw createError({ statusCode: 400, statusMessage: 'You cannot report your own post' })

  return {
    row: {
      reporterId,
      reportedUserId: post.authorId,
      postId,
      isPostReport: true,
      snapshot: { body: post.body, photoCount: post._count.photos, sharedWorkout: post.sharedWorkoutKind !== null },
    },
    existing: { reporterId, postId },
  }
}

/**
 * The report row for another user. A user who blocked the reporter is the same
 * 404 as their profile; one the reporter blocked may still be reported.
 * @throws {H3Error} 404
 */
async function userDraft(userId: string, reporterId: string): Promise<ReportDraft> {
  const notFound = () => createError({ statusCode: 404, statusMessage: 'User not found' })
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, avatarUrl: true } })
  if (!user) throw notFound()
  const blockedMe = await prisma.userBlock.findUnique({
    where: { blockerId_blockedId: { blockerId: userId, blockedId: reporterId } },
    select: { id: true },
  })
  if (blockedMe) throw notFound()

  return {
    row: { reporterId, reportedUserId: userId, isPostReport: false, snapshot: { name: user.name, avatarUrl: user.avatarUrl } },
    existing: { reporterId, reportedUserId: userId, isPostReport: false },
  }
}

export default defineEventHandler(async (event): Promise<{ id: string }> => {
  const userId = event.context.userId as string
  const log = event.context.logger ?? logger
  const { target, reason, details } = parseReportInput(await readBody(event), userId)

  try {
    await rateLimitByKey(`report:${userId}`, 20, '1 h')

    const { row, existing } = target.kind === 'post'
      ? await postDraft(target.postId, userId)
      : await userDraft(target.userId, userId)

    // A repeat is a no-op: the first report stands (the partial unique indexes
    // enforce it; a concurrent duplicate's P2002 lands here too).
    const findExisting = () => prisma.report.findFirst({ where: existing, select: { id: true } })
    const prior = await findExisting()
    if (prior) return prior

    let created: { id: string }
    try {
      created = await prisma.report.create({ data: { ...row, reason, details }, select: { id: true } })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await findExisting()
        if (winner) return winner
      }
      throw err
    }

    event.node.res.statusCode = 201

    // Alert the moderator (a Sentry alert rule emails on this message; see
    // docs/social/MODERATION.md). Ids and the reason only — never the text.
    // Fingerprinted per report so each is a new issue, which is what a
    // "new issue" alert fires on; without it every report groups into one.
    // The report is already stored, so an alert failure never fails the request.
    try {
      Sentry.captureMessage('social.report', {
        level: 'warning',
        fingerprint: ['social.report', created.id],
        tags: { 'report.id': created.id, 'report.target': target.kind, 'report.reason': reason },
      })
      log.info({ reportId: created.id, target: target.kind, reason }, 'social.report')
    } catch (err) {
      log.error({ err, reportId: created.id, route: 'POST /api/reports' }, '[POST /api/reports] Failed to alert on report')
    }
    return created
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    log.error({ err: error, route: 'POST /api/reports' }, '[POST /api/reports] Failed to create report')
    throw createError({ statusCode: 500, statusMessage: 'Failed to create report' })
  }
})
