import type { Prisma } from '@prisma/client'

/**
 * The signed-in user's own profile and settings, as GET and PATCH
 * /api/auth/me return them. The only shape that includes the caller's email.
 */
export const meSelect = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  ptRoutineInWorkout: true,
  profileVisibility: true,
  username: true,
  bio: true,
} satisfies Prisma.UserSelect

export const BIO_MAX = 100

/**
 * A profile bio: trimmed, at most BIO_MAX characters, blank or null → null.
 * Counted in code points, as the database's char_length CHECK does, so an
 * emoji counts once (JS `.length` would count it twice).
 * @throws {H3Error} 400
 */
export function parseBio(raw: unknown): string | null {
  if (raw === null) return null
  if (typeof raw !== 'string') {
    throw createError({ statusCode: 400, statusMessage: `bio must be a string of up to ${BIO_MAX} characters` })
  }
  const bio = raw.trim()
  if ([...bio].length > BIO_MAX) {
    throw createError({ statusCode: 400, statusMessage: `bio must be a string of up to ${BIO_MAX} characters` })
  }
  return bio || null
}
