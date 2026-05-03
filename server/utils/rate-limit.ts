import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import type { H3Event } from 'h3'

// 10 requests per minute per IP on auth endpoints — module-level singleton
let ratelimit: Ratelimit | null = null
let initialized = false

function getRatelimit(): Ratelimit | null {
  if (initialized) return ratelimit
  initialized = true

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) return null

  ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(10, '1 m'),
    analytics: false,
  })
  return ratelimit
}

export async function rateLimitByIp(event: H3Event): Promise<void> {
  const rl = getRatelimit()
  if (!rl) return

  const forwarded = getHeader(event, 'x-forwarded-for')
  const ip =
    forwarded?.split(',').at(0)?.trim() ||
    (event.node.req.socket as { remoteAddress?: string } | undefined)?.remoteAddress ||
    'unknown'

  const { success } = await rl.limit(ip)
  if (!success) {
    throw createError({ statusCode: 429, statusMessage: 'Too many requests' })
  }
}
