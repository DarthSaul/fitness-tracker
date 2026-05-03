import type { User } from '@prisma/client'
import { prisma } from './prisma'

export interface ProviderProfile {
  provider: 'google' | 'apple' | 'email'
  providerId: string
  email: string
  name?: string | null
  avatarUrl?: string | null
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
    return prisma.user.update({
      where: { id: existing.userId },
      data: {
        email: profile.email,
        ...(profile.name !== undefined && { name: profile.name }),
        ...(profile.avatarUrl !== undefined && { avatarUrl: profile.avatarUrl }),
      },
    })
  }

  return prisma.$transaction(async (tx) => {
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
}
