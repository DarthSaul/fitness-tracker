/**
 * Returns true when the given email is on the allow-list.
 *
 * Rules:
 *  - Comparison is case-insensitive.
 *  - Leading/trailing whitespace in each list entry is stripped.
 *  - If ALLOWED_EMAILS is unset or empty, NO email is allowed (safe default).
 */
export function isEmailAllowed(email: string): boolean {
  const raw = process.env.ALLOWED_EMAILS ?? ''
  if (!raw.trim()) return false

  const allowed = raw
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)

  return allowed.includes(email.trim().toLowerCase())
}
