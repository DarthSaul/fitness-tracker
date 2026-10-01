import type { Prisma, ProfileVisibility } from '@prisma/client'

// Explicit (not auto-imported): postSelect reads it at module load.
import { publicUserSelect, type PublicUser } from './public-user'

/**
 * Post helpers shared by every social route that reads or writes posts
 * (docs/social/SPEC-posts.md, SPEC-follows.md). `canViewPostsBy` is the only
 * implementation of the visibility rule; `toPost` the only builder of the payload.
 */

export const POST_BODY_MAX = 2000

export const postSelect = {
  id: true,
  authorId: true,
  body: true,
  // Post.visibility is deprecated (privacy is per profile) and deliberately unread.
  createdAt: true,
  editedAt: true,
  author: { select: publicUserSelect },
} satisfies Prisma.PostSelect

export type PostRow = Prisma.PostGetPayload<{ select: typeof postSelect }>

export interface PostPayload {
  id: string
  author: PublicUser
  body: string
  createdAt: Date
  editedAt: Date | null
  isMine: boolean
}

export function toPost(row: PostRow, viewerId: string): PostPayload {
  return {
    id: row.id,
    author: row.author,
    body: row.body,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    isMine: row.authorId === viewerId,
  }
}

/**
 * Whether `viewerId` may see `author`'s posts. The author always may. Anyone
 * else needs no block in either direction, and the profile to be PUBLIC or an
 * ACCEPTED follow of it. Read live on every call, so going private, removing a
 * follower or unfollowing takes effect on the next request.
 */
export async function canViewPostsBy(viewerId: string, author: { id: string; profileVisibility: ProfileVisibility }): Promise<boolean> {
  if (author.id === viewerId) return true
  if (await isBlockedEitherWay(viewerId, author.id)) return false
  if (author.profileVisibility === 'PUBLIC') return true
  return isFollowing(viewerId, author.id)
}

/** Trimmed body, 1–POST_BODY_MAX characters. @throws {H3Error} 400 */
export function parsePostBody(raw: unknown): string {
  const body = typeof raw === 'string' ? raw.trim() : ''
  if (body.length < 1 || body.length > POST_BODY_MAX) {
    throw createError({ statusCode: 400, statusMessage: `body must be 1–${POST_BODY_MAX} characters` })
  }
  return body
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
