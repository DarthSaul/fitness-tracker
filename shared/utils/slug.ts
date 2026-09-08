/**
 * Derive a URL-safe slug from a display name.
 *
 * Rules, in order: lowercase → drop apostrophes (so "Farmer's" → "farmers",
 * not "farmer-s") → collapse every run of non `a-z0-9` characters into a
 * single hyphen → trim leading/trailing hyphens.
 *
 * The one-shot SQL backfill in the `add_exercise_slug` migration applies the
 * same rules in Postgres. Keep the two in sync: the seed re-derives
 * `Exercise.slug` from `name` on every run, so any drift here silently
 * rewrites slugs.
 *
 * @throws if the input yields an empty slug (e.g. only punctuation), since an
 *   empty value would collide on the unique column instead of failing loudly.
 */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!slug) {
    throw new Error(`Cannot derive a slug from ${JSON.stringify(name)}`)
  }
  return slug
}
