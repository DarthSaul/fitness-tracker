import type { H3Event } from 'h3'
import { prisma } from './prisma'

/**
 * Mints the token pair returned by the native (`/api/auth/native/*`) sign-in
 * routes: a short-lived JWT access token plus an opaque refresh token. Only
 * the SHA-256 hash of the refresh token is persisted — the raw value goes to
 * the client once and cannot be recovered from the database.
 */
export async function issueTokenPair(
  event: H3Event,
  userId: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = await signAccessToken(userId)

  const raw = crypto.randomUUID() + crypto.randomUUID()
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  const tokenHash = Buffer.from(hashBuffer).toString('hex')

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      deviceInfo: getHeader(event, 'user-agent') ?? null,
    },
  })

  return { accessToken, refreshToken: raw }
}
