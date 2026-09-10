/**
 * Signed delivery for licensed exercise demonstration media.
 *
 * The clips live in the PRIVATE `exercise-media` Supabase Storage bucket, and
 * `Exercise` rows store only the object keys (`animationPath`, `posterPath`).
 * A stored key is therefore not a link: nothing in the bucket is reachable
 * without a signature. `GET /api/exercises/:id/info` calls
 * {@link signExerciseMedia} on every read to mint URLs that expire after
 * {@link EXERCISE_MEDIA_TTL_SECONDS}, which is the "display and stream, never
 * distribute" delivery the MoveKit license requires (Section 3). See
 * docs/licenses/movekit.md for the licensing rationale.
 *
 * `supabase` is the service-role client auto-imported from server/utils/supabase.ts.
 */

export const EXERCISE_MEDIA_BUCKET = 'exercise-media'

/**
 * 15 minutes: long enough to open a preview and watch a few loops, short enough
 * that a forwarded link is useless by the time anyone else tries it. Clients
 * re-request the info route when `mediaExpiresAt` passes.
 */
export const EXERCISE_MEDIA_TTL_SECONDS = 900

export interface ExerciseMediaPaths {
  animationPath: string | null
  posterPath: string | null
}

export interface SignedExerciseMedia {
  animationUrl: string | null
  posterUrl: string | null
  /** ISO timestamp after which the URLs above stop working; null when there is no media. */
  mediaExpiresAt: string | null
}

/**
 * Mint short-lived signed URLs for an exercise's demo clip and poster.
 *
 * Both keys are signed in a single storage round trip. Returns all-null when
 * the exercise has no media, without calling storage.
 *
 * @throws Error when storage refuses the request or cannot sign one of the keys
 *   — a genuine server-side fault the route should surface as a 500.
 */
export async function signExerciseMedia(paths: ExerciseMediaPaths): Promise<SignedExerciseMedia> {
  const keys = [paths.animationPath, paths.posterPath].filter(
    (key): key is string => typeof key === 'string' && key.length > 0,
  )
  if (keys.length === 0) {
    return { animationUrl: null, posterUrl: null, mediaExpiresAt: null }
  }

  // Computed before the round trip so the reported expiry is never later than
  // the real one.
  const mediaExpiresAt = new Date(Date.now() + EXERCISE_MEDIA_TTL_SECONDS * 1000).toISOString()

  const { data, error } = await supabase.storage
    .from(EXERCISE_MEDIA_BUCKET)
    .createSignedUrls(keys, EXERCISE_MEDIA_TTL_SECONDS)
  if (error || !data) {
    throw new Error(`exercise-media: signing failed: ${error?.message ?? 'no data returned'}`)
  }

  const urlByKey = new Map<string, string>()
  for (const item of data) {
    if (item.error || !item.path || !item.signedUrl) {
      throw new Error(`exercise-media: could not sign ${item.path ?? 'unknown key'}: ${item.error ?? 'no signed URL returned'}`)
    }
    urlByKey.set(item.path, item.signedUrl)
  }

  const lookup = (key: string | null): string | null => {
    if (!key) return null
    const url = urlByKey.get(key)
    if (!url) throw new Error(`exercise-media: storage returned no signed URL for ${key}`)
    return url
  }

  return {
    animationUrl: lookup(paths.animationPath),
    posterUrl: lookup(paths.posterPath),
    mediaExpiresAt,
  }
}
