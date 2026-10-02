import type { ReportReason } from '@prisma/client'

/**
 * Reports of posts and users, kept for moderation (docs/social/SPEC-reports.md).
 * Moderators resolve them in SQL (docs/social/MODERATION.md).
 */

/** The fixed reasons, in the order the app lists them. */
export const REPORT_REASONS = [
  'SPAM', 'HARASSMENT', 'HATE', 'SEXUAL_CONTENT', 'VIOLENCE', 'SELF_HARM', 'IMPERSONATION', 'OTHER',
] as const satisfies readonly ReportReason[]

export const REPORT_DETAILS_MAX = 1000

export type ReportTarget = { kind: 'post'; postId: string } | { kind: 'user'; userId: string }

export interface ReportInput {
  target: ReportTarget
  reason: ReportReason
  /** Trimmed; null when omitted or blank. */
  details: string | null
}

function parseId(raw: unknown, key: string): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: `${key} must be an id` })
  }
  return raw.trim()
}

/**
 * `{ postId | userId, reason, details? }`: exactly one target, a listed reason,
 * details up to REPORT_DETAILS_MAX characters. Reporting yourself is rejected
 * here; reporting your own post needs the post, so the route checks that.
 * @throws {H3Error} 400
 */
export function parseReportInput(input: unknown, reporterId: string): ReportInput {
  const raw = (input ?? {}) as { postId?: unknown; userId?: unknown; reason?: unknown; details?: unknown }

  if ((raw.postId === undefined) === (raw.userId === undefined)) {
    throw createError({ statusCode: 400, statusMessage: 'Report one target: postId or userId' })
  }
  const target: ReportTarget = raw.postId !== undefined
    ? { kind: 'post', postId: parseId(raw.postId, 'postId') }
    : { kind: 'user', userId: parseId(raw.userId, 'userId') }
  if (target.kind === 'user' && target.userId === reporterId) {
    throw createError({ statusCode: 400, statusMessage: 'You cannot report yourself' })
  }

  if (!(REPORT_REASONS as readonly unknown[]).includes(raw.reason)) {
    throw createError({ statusCode: 400, statusMessage: `reason must be one of ${REPORT_REASONS.join(', ')}` })
  }

  let details: string | null = null
  if (raw.details !== undefined && raw.details !== null) {
    if (typeof raw.details !== 'string' || raw.details.trim().length > REPORT_DETAILS_MAX) {
      throw createError({ statusCode: 400, statusMessage: `details must be up to ${REPORT_DETAILS_MAX} characters` })
    }
    details = raw.details.trim() || null
  }

  return { target, reason: raw.reason as ReportReason, details }
}
