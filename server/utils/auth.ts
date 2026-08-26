import type { User } from '@prisma/client'
import { prisma } from './prisma'

export interface ProviderProfile {
  provider: 'google' | 'apple' | 'email'
  providerId: string
  email: string
  name?: string | null
  avatarUrl?: string | null
}

/** True for Prisma's unique-constraint violation (P2002), optionally narrowed to a specific column. */
function isP2002(error: unknown, target?: string): boolean {
  const e = error as { code?: string; meta?: { target?: string[] | string } } | null
  if (!e || e.code !== 'P2002') return false
  if (!target) return true
  const t = e.meta?.target
  return Array.isArray(t) ? t.includes(target) : t === target
}

/**
 * Finds an existing User by Identity, or by verified email (account linking),
 * or creates a new User. Profile fields are refreshed on every call.
 *
 * SAFETY: auto-linking by email assumes the caller has verified the email
 * with the OAuth provider. Apple and Google verify before issuing identity
 * tokens; email/password signup verifies via Supabase confirmation
 * (`server/api/auth/email/signup.post.ts` only calls this AFTER confirmation).
 * Adding an unverified-email provider would make this a takeover vector.
 */
export async function findOrLinkUser(profile: ProviderProfile): Promise<User> {
  const existing = await prisma.identity.findUnique({
    where: {
      provider_providerId: {
        provider: profile.provider,
        providerId: profile.providerId,
      },
    },
  })

  if (existing) {
    return refreshUser(existing.userId, profile)
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const userByEmail = await tx.user.findUnique({ where: { email: profile.email } })
      if (userByEmail) {
        await tx.identity.create({
          data: {
            userId: userByEmail.id,
            provider: profile.provider,
            providerId: profile.providerId,
          },
        })
        return tx.user.update({
          where: { id: userByEmail.id },
          data: {
            ...(profile.name !== undefined && profile.name !== null && { name: profile.name }),
            ...(profile.avatarUrl !== undefined && profile.avatarUrl !== null && { avatarUrl: profile.avatarUrl }),
          },
        })
      }

      return tx.user.create({
        data: {
          email: profile.email,
          name: profile.name ?? null,
          avatarUrl: profile.avatarUrl ?? null,
          identities: {
            create: {
              provider: profile.provider,
              providerId: profile.providerId,
            },
          },
        },
      })
    })
  } catch (error) {
    // Concurrent first-login: another request already created the Identity (or
    // the User by email). One re-resolve via the identity index covers both.
    if (isP2002(error)) {
      const racedIdentity = await prisma.identity.findUnique({
        where: {
          provider_providerId: {
            provider: profile.provider,
            providerId: profile.providerId,
          },
        },
      })
      if (racedIdentity) {
        return refreshUser(racedIdentity.userId, profile)
      }
    }
    throw error
  }
}

/**
 * Refresh fields on the User row that owns an existing Identity.
 *
 * Wrapped in a try/catch because `email: profile.email` can violate
 * `User.email @unique` if the provider's email later collides with another
 * User's email (rare: provider account email-change). On that conflict, retry
 * the update without the email field so name/avatar still get refreshed.
 */
async function refreshUser(userId: string, profile: ProviderProfile): Promise<User> {
  try {
    return await prisma.user.update({
      where: { id: userId },
      data: {
        email: profile.email,
        ...(profile.name !== undefined && { name: profile.name }),
        ...(profile.avatarUrl !== undefined && { avatarUrl: profile.avatarUrl }),
      },
    })
  } catch (error) {
    if (isP2002(error, 'email')) {
      return prisma.user.update({
        where: { id: userId },
        data: {
          ...(profile.name !== undefined && { name: profile.name }),
          ...(profile.avatarUrl !== undefined && { avatarUrl: profile.avatarUrl }),
        },
      })
    }
    throw error
  }
}

/**
 * One-time backfill of the optional name captured at email/password sign-up.
 *
 * A confirmation-required signup cannot write the name to the database — no
 * User row may exist until Supabase verifies the address (see the SAFETY note
 * on findOrLinkUser) — so signup stashes it in Supabase user metadata and the
 * first sign-in lands here. Only a null name is filled: a name set by a linked
 * OAuth provider or edited in-app always wins.
 */
export async function backfillNameFromMetadata(user: User, metadata: unknown): Promise<User> {
  if (user.name) return user

  const rawName = (metadata as { name?: unknown } | null | undefined)?.name
  const name = typeof rawName === 'string' ? rawName.trim() : ''
  if (!name) return user

  return prisma.user.update({ where: { id: user.id }, data: { name } })
}
