import { randomInt } from 'node:crypto'

/**
 * Usernames (docs/social/SPEC-usernames.md): unique, stored lowercase,
 * 3–30 of a–z 0–9 "_" "." with no leading, trailing or doubled period. The
 * migration's CHECK enforces the same format in the database.
 */

const USERNAME_FORMAT = /^[a-z0-9_.]{3,30}$/
const BAD_PERIODS = /^\.|\.$|\.\./

/**
 * Names nobody may claim, so future /@name links and support channels can't
 * be impersonated. Compared after normalizing.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin', 'administrator', 'support', 'help', 'api', 'app', 'www', 'root', 'system',
  'moderator', 'mod', 'staff', 'official', 'security',
  'drdumbbell', 'dr.dumbbell', 'dr_dumbbell', 'dumbbell',
  'settings', 'login', 'signup', 'about', 'privacy', 'terms', 'home', 'feed', 'me', 'null', 'undefined',
])

/** Trimmed, one leading "@" dropped, lowercased: "@SaulG" → "saulg". */
export function normalizeUsername(raw: string): string {
  const trimmed = raw.trim()
  return (trimmed.startsWith('@') ? trimmed.slice(1) : trimmed).toLowerCase()
}

/** Why a normalized username can't be used, or null if it can (availability aside). */
export function usernameProblem(name: string): 'invalid' | 'reserved' | null {
  if (!USERNAME_FORMAT.test(name) || BAD_PERIODS.test(name)) return 'invalid'
  if (RESERVED_USERNAMES.has(name)) return 'reserved'
  return null
}

/**
 * A requested username, normalized and validated. Whether it's taken is
 * decided by the unique index on write.
 * @throws {H3Error} 400
 */
export function parseUsername(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'username must be a string' })
  }
  const name = normalizeUsername(raw)
  const problem = usernameProblem(name)
  if (problem === 'reserved') {
    throw createError({ statusCode: 400, statusMessage: 'That username is reserved' })
  }
  if (problem === 'invalid') {
    throw createError({
      statusCode: 400,
      statusMessage: 'username must be 3–30 of a–z, 0–9, "_" and ".", with no leading, trailing or consecutive periods',
    })
  }
  return name
}

/**
 * A generated username, "user_" + 6 random digits (user_004821). Used at
 * sign-up and by the backfill migration's identical SQL; the caller retries on
 * a collision. Reveals nothing about the user.
 */
export function generateUsername(): string {
  return `user_${String(randomInt(0, 1_000_000)).padStart(6, '0')}`
}
