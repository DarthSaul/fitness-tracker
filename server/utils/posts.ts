import type { Prisma, ProfileVisibility, WorkoutShareKind } from '@prisma/client'

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
  // The share snapshot only: never the session itself (SPEC-workout-shares.md).
  sharedWorkoutKind: true,
  sharedProgramName: true,
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
  /** Per-emoji totals (blocked users excluded) and whether the caller reacted. */
  reactions: ReactionSummary[]
  /**
   * A shared workout, as text-only data: null when the post shares none;
   * programName null for a standalone workout.
   */
  workout: { programName: string | null } | null
}

/**
 * Build the payloads for a page of posts the viewer has already passed the
 * visibility rule for. Every photo on the page is signed in ONE storage call,
 * and reactions are summarized for the whole page at once, so a feed page's
 * cost doesn't grow with the number of photos or reactions it shows.
 */
export async function toPostPayloads(rows: PostRow[], viewerId: string): Promise<PostPayload[]> {
  const [signed, reactions] = await Promise.all([
    signPostPhotos(rows.flatMap((r) => r.photos.map((p) => p.storagePath))),
    reactionSummaries(rows.map((r) => r.id), viewerId),
  ])

  return rows.map((row) => ({
    id: row.id,
    author: row.author,
    body: row.body,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    isMine: row.authorId === viewerId,
    photos: row.photos.map((p) => ({ id: p.id, url: signed.urls.get(p.storagePath)!, width: p.width, height: p.height })),
    photosExpireAt: row.photos.length > 0 ? signed.expiresAt : null,
    reactions: reactions.get(row.id) ?? [],
    workout: row.sharedWorkoutKind ? { programName: row.sharedProgramName } : null,
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
 * The post, if `viewerId` may see it; otherwise 404, the same as a post that
 * doesn't exist, so a hidden post never reveals itself. The shared gate for
 * routes that act on a post by id (reactions).
 * @throws {H3Error} 404
 */
export async function requireVisiblePost(postId: string, viewerId: string): Promise<{ id: string; author: { id: string; profileVisibility: ProfileVisibility } }> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, author: { select: { id: true, profileVisibility: true } } },
  })
  if (!post || !(await canViewPostsBy(viewerId, post.author))) {
    throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  }
  return post
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

/** The session a new post shares; ownership and status are checked on create. */
export interface WorkoutShareInput {
  kind: WorkoutShareKind
  sessionId: string
}

function parseSessionId(raw: unknown, key: string): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: `${key} must be a session id` })
  }
  return raw.trim()
}

/** At most one of `workoutSessionId` / `standaloneSessionId`. @throws {H3Error} 400 */
function parseWorkoutShare(raw: { workoutSessionId?: unknown; standaloneSessionId?: unknown }): WorkoutShareInput | null {
  if (raw.workoutSessionId !== undefined && raw.standaloneSessionId !== undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Share one workout: workoutSessionId or standaloneSessionId, not both' })
  }
  if (raw.workoutSessionId !== undefined) {
    return { kind: 'PROGRAM', sessionId: parseSessionId(raw.workoutSessionId, 'workoutSessionId') }
  }
  if (raw.standaloneSessionId !== undefined) {
    return { kind: 'STANDALONE', sessionId: parseSessionId(raw.standaloneSessionId, 'standaloneSessionId') }
  }
  return null
}

/**
 * A new post's `{ body?, photoIds?, workoutSessionId? | standaloneSessionId? }`:
 * 0–4 distinct photo ids in display order, at most one shared workout, and text
 * that may be empty only when there is a photo or a share. Whether each id is
 * the caller's own (unattached upload, completed session) is checked on create.
 * @throws {H3Error} 400
 */
export function parsePostContent(input: unknown): { body: string; photoIds: string[]; share: WorkoutShareInput | null } {
  const raw = (input ?? {}) as { body?: unknown; photoIds?: unknown; workoutSessionId?: unknown; standaloneSessionId?: unknown }

  let photoIds: string[] = []
  if (raw.photoIds !== undefined) {
    const ids = raw.photoIds
    const valid = Array.isArray(ids) && ids.every((id) => typeof id === 'string' && id.trim().length > 0)
    if (!valid || ids.length > POST_PHOTOS_MAX || new Set(ids).size !== ids.length) {
      throw createError({ statusCode: 400, statusMessage: `photoIds must be up to ${POST_PHOTOS_MAX} distinct photo ids` })
    }
    photoIds = ids as string[]
  }

  const share = parseWorkoutShare(raw)
  const allowEmpty = photoIds.length > 0 || share !== null

  if (allowEmpty && raw.body === undefined) return { body: '', photoIds, share }
  return { body: parsePostBody(raw.body, { allowEmpty }), photoIds, share }
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
// Model-agnostic: any table with `createdAt` + `id` (posts, reactions) pages
// the same way, so these are typed structurally rather than against one model.
type PageWhere = { OR?: ({ createdAt: { lt: Date } } | { createdAt: Date; id: { lt: string } })[] }

export function pageWhere(before: PageQuery['before']): PageWhere {
  if (!before) return {}
  return { OR: [{ createdAt: { lt: before.createdAt } }, { createdAt: before.createdAt, id: { lt: before.id } }] }
}

export const newestFirst: [{ createdAt: 'desc' }, { id: 'desc' }] = [{ createdAt: 'desc' }, { id: 'desc' }]
