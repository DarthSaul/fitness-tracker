import { SignJWT, jwtVerify, errors as joseErrors } from 'jose'

function getSecrets() {
  const config = useRuntimeConfig()
  if (!config.jwtAccessSecret || !config.jwtRefreshSecret) {
    throw new Error('JWT secrets are not configured')
  }
  return {
    accessSecret: new TextEncoder().encode(config.jwtAccessSecret as string),
    refreshSecret: new TextEncoder().encode(config.jwtRefreshSecret as string),
  }
}

export async function signAccessToken(userId: string): Promise<string> {
  const { accessSecret } = getSecrets()
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .setIssuer('fitness-tracker')
    .setAudience('fitness-tracker-api')
    .sign(accessSecret)
}

export async function signRefreshToken(userId: string): Promise<string> {
  const { refreshSecret } = getSecrets()
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .setIssuer('fitness-tracker')
    .setAudience('fitness-tracker-api')
    .sign(refreshSecret)
}

export async function verifyAccessToken(token: string): Promise<{ sub: string }> {
  const { accessSecret } = getSecrets()
  const { payload } = await jwtVerify(token, accessSecret, {
    issuer: 'fitness-tracker',
    audience: 'fitness-tracker-api',
  })
  if (!payload.sub) throw new joseErrors.JWTInvalid('Missing sub claim')
  return { sub: payload.sub }
}
