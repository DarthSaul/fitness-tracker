import { importPKCS8, SignJWT } from 'jose'
import { Pool } from 'undici'

// APNs JWT cache — valid 60 min; refresh 5 min early
let cachedApnsToken: { token: string; issuedAt: number } | null = null

async function getApnsJwt(): Promise<string> {
  const now = Date.now()
  if (cachedApnsToken && now - cachedApnsToken.issuedAt < 55 * 60 * 1000) {
    return cachedApnsToken.token
  }

  const config = useRuntimeConfig()
  const teamId = config.apnsTeamId as string
  const keyId = config.apnsKeyId as string
  const privateKeyPem = Buffer.from(config.apnsPrivateKey as string, 'base64').toString('utf-8')

  if (!teamId || !keyId || !privateKeyPem) {
    throw new Error('APNs configuration is incomplete')
  }

  const privateKey = await importPKCS8(privateKeyPem, 'ES256')
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuedAt()
    .setIssuer(teamId)
    .sign(privateKey)

  cachedApnsToken = { token, issuedAt: now }
  return token
}

// HTTP/2 connection pools — reused within a function instance
let prodPool: Pool | null = null
let sandboxPool: Pool | null = null

function getPool(environment: string): Pool {
  if (environment === 'PRODUCTION') {
    if (!prodPool) prodPool = new Pool('https://api.push.apple.com', { allowH2: true })
    return prodPool
  }
  if (!sandboxPool) sandboxPool = new Pool('https://api.sandbox.push.apple.com', { allowH2: true })
  return sandboxPool
}

interface ApnsPayload {
  aps: {
    alert: { title: string; body: string }
    badge?: number
    sound?: string
  }
}

async function sendPushToDevice(
  deviceToken: string,
  bundleId: string,
  environment: string,
  payload: ApnsPayload,
  userId: string,
): Promise<void> {
  const jwt = await getApnsJwt()
  const pool = getPool(environment)

  const response = await pool.request({
    path: `/3/device/${deviceToken}`,
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const maskedToken = `${deviceToken.slice(0, 4)}${'*'.repeat(Math.max(0, deviceToken.length - 8))}${deviceToken.slice(-4)}`

  if (response.statusCode === 410) {
    // Device token is no longer active — consume body then soft-revoke
    await response.body.text().catch(() => {})
    await prisma.deviceToken
      .update({
        where: { token_environment: { token: deviceToken, environment } },
        data: { revokedAt: new Date() },
      })
      .catch((err: unknown) => logger.error({ err, route: 'APNs' }, '[APNs] Failed to revoke stale device token'))
    return
  }

  if (response.statusCode !== 200) {
    const body = await response.body.text()
    logger.error({ route: 'APNs', maskedToken, statusCode: response.statusCode, body }, '[APNs] Push failed')
    return
  }

  await response.body.text().catch(() => {})
}

export async function sendPush(userId: string, payload: ApnsPayload): Promise<void> {
  const config = useRuntimeConfig()
  const bundleId = config.appleBundleId as string

  if (!bundleId) {
    logger.warn({ route: 'APNs' }, '[APNs] Missing appleBundleId; skipping push dispatch')
    return
  }

  const tokens = await prisma.deviceToken
    .findMany({ where: { userId, revokedAt: null } })
    .catch((err: unknown) => {
      logger.error({ err, route: 'APNs' }, '[APNs] Failed to load device tokens')
      return null
    })

  if (!tokens || tokens.length === 0) return

  const results = await Promise.allSettled(
    tokens.map((t) => sendPushToDevice(t.token, bundleId, t.environment, payload, userId)),
  )
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error({ err: result.reason, route: 'APNs' }, '[APNs] sendPushToDevice failed')
    }
  }
}
