import { SignJWT, jwtVerify, decodeJwt, errors as joseErrors } from 'jose'

function getAccessSecret(): Uint8Array {
  const config = useRuntimeConfig()
  if (!config.jwtAccessSecret) throw new Error('JWT access secret is not configured')
  return new TextEncoder().encode(config.jwtAccessSecret as string)
}

function getRefreshSecret(): Uint8Array {
  const config = useRuntimeConfig()
  if (!config.jwtRefreshSecret) throw new Error('JWT refresh secret is not configured')
  return new TextEncoder().encode(config.jwtRefreshSecret as string)
}

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId, tokenType: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .setIssuer('fitness-tracker')
    .setAudience('fitness-tracker-api')
    .sign(getAccessSecret())
}

export async function signRefreshToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId, tokenType: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .setIssuer('fitness-tracker')
    .setAudience('fitness-tracker-api')
    .sign(getRefreshSecret())
}

/**
 * Best-effort extraction of the `sub` claim from a JWT **without verifying the
 * signature or claims**. Used only for observability triage on failed-auth
 * requests (the token couldn't be trusted, so we can't call the verified path).
 * The returned id is UNTRUSTED — never use it for authorization decisions.
 * @returns the `sub` string, or `null` if the token is malformed or has no sub.
 */
export function decodeUnverifiedSub(token: string): string | null {
  try {
    const payload = decodeJwt(token)
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null
  } catch {
    return null
  }
}

export async function verifyAccessToken(token: string): Promise<{ sub: string }> {
  const { payload } = await jwtVerify(token, getAccessSecret(), {
    issuer: 'fitness-tracker',
    audience: 'fitness-tracker-api',
  })
  if (!payload.sub) throw new joseErrors.JWTInvalid('Missing sub claim')
  if (payload.tokenType !== 'access') throw new joseErrors.JWTInvalid('Invalid token type')
  return { sub: payload.sub }
}
