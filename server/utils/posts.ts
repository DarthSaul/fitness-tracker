import type { Prisma, ProfileVisibility } from '@prisma/client'

// Explicit (not auto-imported): postSelect reads it at module load.
import { publicUserSelect, type PublicUser } from './public-user'

/**
 * Post helpers shared by every social route that reads or writes posts
 * (docs/social/SPEC-posts.md, SPEC-follows.md). `canViewPostsBy` is the only
 * implementation of the visibility rule; `toPostPayloads` the only builder of the payload.
 */

export const POST_BODY_MAX = 2000
export const POST_PHOTOS_MAX = 4

export const postSelect = {
  id: true,
  authorId: true,
  body: true,
  createdAt: true,
  editedAt: true,
  author: { select: publicUserSelect },
  photos: { select: { id: true, storagePath: true, width: true, height: true }, orderBy: { position: 'asc' } },
} satisfies Prisma.PostSelect

export type PostRow = Prisma.PostGetPayload<{ select: typeof postSelect }>

export interface PostPhotoPayload {
  id: string
  url: string
  width: number
  height: number
}

export interface PostPayload {
  id: string
  author: PublicUser
  body: string
  createdAt: Date
  editedAt: Date | null
  isMine: boolean
  /** In display order; [] for a text-only post. */
  photos: PostPhotoPayload[]
  /** When the photo URLs stop working; null when the post has no photos. */
  photosExpireAt: string | null
}

/**
 * Build the payloads for a page of posts the viewer has already passed the
 * visibility rule for. Every photo on the page is signed in ONE storage call,
 * so a feed page costs one round trip however many photos it shows.
 */
export async function toPostPayloads(rows: PostRow[], viewerId: string): Promise<PostPayload[]> {
  const signed = await signPostPhotos(rows.flatMap((r) => r.photos.map((p) => p.storagePath)))

  return rows.map((row) => ({
    id: row.id,
    author: row.author,
    body: row.body,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    isMine: row.authorId === viewerId,
    photos: row.photos.map((p) => ({ id: p.id, url: signed.urls.get(p.storagePath)!, width: p.width, height: p.height })),
    photosExpireAt: row.photos.length > 0 ? signed.expiresAt : null,
  }))
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

/**
 * Trimmed body, 1–POST_BODY_MAX characters — or 0 with `allowEmpty`, for a post
 * that has photos. @throws {H3Error} 400
 */
export function parsePostBody(raw: unknown, { allowEmpty = false }: { allowEmpty?: boolean } = {}): string {
  if (typeof raw !== 'string') {
    throw createError({ statusCode: 400, statusMessage: `body must be 1–${POST_BODY_MAX} characters` })
  }
  const body = raw.trim()
  if ((!allowEmpty && body.length < 1) || body.length > POST_BODY_MAX) {
    throw createError({ statusCode: 400, statusMessage: `body must be 1–${POST_BODY_MAX} characters` })
  }
  return body
}

/**
 * A new post's `{ body?, photoIds? }`: 0–4 distinct photo ids, in display order,
 * and text that may be empty only when there is at least one photo.
 * Whether each id is the caller's own unattached upload is checked on attach.
 * @throws {H3Error} 400
 */
export function parsePostContent(input: unknown): { body: string; photoIds: string[] } {
  const raw = (input ?? {}) as { body?: unknown; photoIds?: unknown }

  let photoIds: string[] = []
  if (raw.photoIds !== undefined) {
    const ids = raw.photoIds
    const valid = Array.isArray(ids) && ids.every((id) => typeof id === 'string' && id.trim().length > 0)
    if (!valid || ids.length > POST_PHOTOS_MAX || new Set(ids).size !== ids.length) {
      throw createError({ statusCode: 400, statusMessage: `photoIds must be up to ${POST_PHOTOS_MAX} distinct photo ids` })
    }
    photoIds = ids as string[]
  }

  if (photoIds.length > 0 && raw.body === undefined) return { body: '', photoIds }
  return { body: parsePostBody(raw.body, { allowEmpty: photoIds.length > 0 }), photoIds }
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
