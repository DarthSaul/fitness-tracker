import type { Prisma } from '@prisma/client'

/**
 * The only user fields the social surface exposes about someone else. Email is
 * deliberately absent — never widen this to include it.
 */
export const publicUserSelect = {
  id: true,
  name: true,
  avatarUrl: true,
  // Public by definition, and lets any list label its button "Follow" vs "Request".
  profileVisibility: true,
} satisfies Prisma.UserSelect

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>
