import { createRemoteJWKSet, jwtVerify } from 'jose'

// Module-level singletons — jose caches the JWKS responses internally
const appleJWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'))
const googleJWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

export async function verifyAppleIdentityToken(identityToken: string): Promise<{ sub: string; email?: string }> {
  const config = useRuntimeConfig()
  const { payload } = await jwtVerify(identityToken, appleJWKS, {
    issuer: 'https://appleid.apple.com',
    audience: config.appleBundleId as string,
  })
  return { sub: payload.sub as string, email: payload.email as string | undefined }
}

export async function verifyGoogleIdToken(idToken: string): Promise<{ sub: string; email: string; name?: string; picture?: string }> {
  const config = useRuntimeConfig()
  const { payload } = await jwtVerify(idToken, googleJWKS, {
    issuer: 'https://accounts.google.com',
    audience: config.oauthGoogleClientId as string,
  })
  return {
    sub: payload.sub as string,
    email: payload.email as string,
    name: payload.name as string | undefined,
    picture: payload.picture as string | undefined,
  }
}
