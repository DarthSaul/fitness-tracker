/**
 * Storage for processed post photos (docs/social/SPEC-post-photos.md).
 *
 * The bytes live in the PRIVATE `post-photos` Supabase Storage bucket; rows
 * store only the object key. A key is not a link: nothing is reachable without
 * a signature, and routes only sign photos of posts the viewer may see. Same
 * delivery model as server/utils/exercise-media.ts. `supabase` is the
 * service-role client auto-imported from server/utils/supabase.ts.
 */

export const POST_PHOTOS_BUCKET = 'post-photos'

/** 15 minutes, like exercise media; clients re-fetch when `photosExpireAt` passes. */
export const POST_PHOTO_TTL_SECONDS = 900

/** Every photo is filed under its uploader, which is what account deletion removes. */
export function postPhotoPath(uploaderId: string, photoId: string): string {
  return `${uploaderId}/${photoId}.jpg`
}

export interface SignedPhotoUrls {
  /** storagePath → signed URL */
  urls: Map<string, string>
  /** ISO time the URLs stop working; null when there was nothing to sign. */
  expiresAt: string | null
}

/**
 * Sign every given object key in ONE storage round trip — callers pass all the
 * photos on a page, not one post's.
 * @throws Error when storage refuses or skips a key — a genuine server fault.
 */
export async function signPostPhotos(paths: string[]): Promise<SignedPhotoUrls> {
  if (paths.length === 0) return { urls: new Map(), expiresAt: null }

  // Computed before the round trip so the reported expiry is never later than the real one.
  const expiresAt = new Date(Date.now() + POST_PHOTO_TTL_SECONDS * 1000).toISOString()

  const { data, error } = await supabase.storage.from(POST_PHOTOS_BUCKET).createSignedUrls(paths, POST_PHOTO_TTL_SECONDS)
  if (error || !data) {
    throw new Error(`post-photos: signing failed: ${error?.message ?? 'no data returned'}`)
  }

  const urls = new Map<string, string>()
  for (const item of data) {
    if (item.error || !item.path || !item.signedUrl) {
      throw new Error(`post-photos: could not sign ${item.path ?? 'unknown key'}: ${item.error ?? 'no signed URL returned'}`)
    }
    urls.set(item.path, item.signedUrl)
  }
  return { urls, expiresAt }
}

/** Store processed JPEG bytes. Never overwrites: keys embed a fresh cuid. @throws Error on failure. */
export async function uploadPostPhotoObject(path: string, data: Buffer): Promise<void> {
  const { error } = await supabase.storage.from(POST_PHOTOS_BUCKET).upload(path, data, { contentType: 'image/jpeg', upsert: false })
  if (error) {
    throw new Error(`post-photos: upload failed: ${error.message}`)
  }
}

interface Log { error: (obj: object, msg: string) => void }

/** Supabase Storage's per-request removal limit. */
const REMOVE_BATCH = 1000

/**
 * Best-effort removal after the rows are gone. Never throws: a failure leaves
 * unreachable private objects (no row points at them, nothing signs them), so
 * it is logged as `post_photos.orphaned` for manual cleanup rather than failing
 * the user's request.
 */
export async function removePostPhotoObjects(paths: string[], log: Log, route: string): Promise<void> {
  // Storage removes at most REMOVE_BATCH objects per request; each batch is
  // independent, so one failure doesn't stop the rest from being removed.
  for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
    const batch = paths.slice(i, i + REMOVE_BATCH)
    try {
      const { error } = await supabase.storage.from(POST_PHOTOS_BUCKET).remove(batch)
      if (error) throw error
    } catch (err) {
      log.error({ err, event: 'post_photos.orphaned', paths: batch, route }, '[post-photos] Storage removal failed — objects orphaned, clean up manually')
    }
  }
}
