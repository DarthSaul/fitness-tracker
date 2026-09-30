import type { Prisma, PostVisibility } from '@prisma/client'

// Explicit (not auto-imported): postSelect reads it at module load.
import { publicUserSelect, type PublicUser } from './public-user'

/**
 * Post helpers shared by every social route that reads or writes posts
 * (docs/social/SPEC-posts.md). `canViewPost` is the only implementation of the
 * visibility rule; `toPost` the only builder of the payload.
 */

export const POST_BODY_MAX = 2000
const VISIBILITIES: readonly PostVisibility[] = ['PUBLIC', 'FRIENDS']

export const postSelect = {
  id: true,
  authorId: true,
  body: true,
  visibility: true,
  createdAt: true,
  editedAt: true,
  author: { select: publicUserSelect },
} satisfies Prisma.PostSelect

export type PostRow = Prisma.PostGetPayload<{ select: typeof postSelect }>

export interface PostPayload {
  id: string
  author: PublicUser
  body: string
  visibility: PostVisibility
  createdAt: Date
  editedAt: Date | null
  isMine: boolean
}

export function toPost(row: PostRow, viewerId: string): PostPayload {
  return {
    id: row.id,
    author: row.author,
    body: row.body,
    visibility: row.visibility,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    isMine: row.authorId === viewerId,
  }
}

/**
 * The author always sees their post. Anyone else needs no block in either
 * direction, and the post to be PUBLIC or the two to be friends now.
 */
export async function canViewPost(viewerId: string, post: { authorId: string; visibility: PostVisibility }): Promise<boolean> {
  if (post.authorId === viewerId) return true
  if (await isBlockedEitherWay(viewerId, post.authorId)) return false
  if (post.visibility === 'PUBLIC') return true
  return areFriends(viewerId, post.authorId)
}

/** Trimmed body, 1–POST_BODY_MAX characters. @throws {H3Error} 400 */
export function parsePostBody(raw: unknown): string {
  const body = typeof raw === 'string' ? raw.trim() : ''
  if (body.length < 1 || body.length > POST_BODY_MAX) {
    throw createError({ statusCode: 400, statusMessage: `body must be 1–${POST_BODY_MAX} characters` })
  }
  return body
}

/** @throws {H3Error} 400 unless `PUBLIC` or `FRIENDS`. */
export function parseVisibility(raw: unknown): PostVisibility {
  if (typeof raw !== 'string' || !VISIBILITIES.includes(raw as PostVisibility)) {
    throw createError({ statusCode: 400, statusMessage: 'visibility must be PUBLIC or FRIENDS' })
  }
  return raw as PostVisibility
}

const DEFAULT_LIMIT = 20
const MIN_LIMIT = 1
const MAX_LIMIT = 50
const DIGITS_ONLY = /^\d+$/

export interface PageQuery {
  limit: number
  before?: { createdAt: Date; id: string }
}

/**
 * `limit` / `before` / `beforeId`, validated exactly as GET /api/history does
 * (same defaults, clamping and 400 messages) so the client pages every list
 * the same way. @throws {H3Error} 400
 */
export function parsePageQuery(query: Record<string, unknown>): PageQuery {
  let limit = DEFAULT_LIMIT
  if (query.limit !== undefined) {
    if (typeof query.limit !== 'string' || !DIGITS_ONLY.test(query.limit)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid limit' })
    }
    limit = Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, Number.parseInt(query.limit, 10)))
  }

  if (query.before === undefined && query.beforeId === undefined) return { limit }

  if (query.before === undefined || query.beforeId === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'before and beforeId must be provided together' })
  }
  if (typeof query.before !== 'string' || query.before === '') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid before' })
  }
  if (typeof query.beforeId !== 'string' || query.beforeId === '') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid beforeId' })
  }
  const createdAt = new Date(query.before)
  if (Number.isNaN(createdAt.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid before timestamp' })
  }
  return { limit, before: { createdAt, id: query.beforeId } }
}

/**
 * Rows strictly after the cursor in newest-first order. Equal timestamps are
 * tiebroken by id so a page boundary never drops or repeats a post.
 */
export function pageWhere(before: PageQuery['before']): Prisma.PostWhereInput {
  if (!before) return {}
  return { OR: [{ createdAt: { lt: before.createdAt } }, { createdAt: before.createdAt, id: { lt: before.id } }] }
}

export const newestFirst = [{ createdAt: 'desc' }, { id: 'desc' }] satisfies Prisma.PostOrderByWithRelationInput[]
