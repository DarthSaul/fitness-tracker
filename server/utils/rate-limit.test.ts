import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

// vi.hoisted ensures these are available inside vi.mock factory (which is hoisted)
const { mockLimit, mockSlidingWindow, ratelimitOptions } = vi.hoisted(() => ({
  mockLimit: vi.fn().mockResolvedValue({ success: true }),
  mockSlidingWindow: vi.fn((limit: number, window: string) => `sliding-window:${limit}/${window}`),
  ratelimitOptions: [] as unknown[],
}))

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow = mockSlidingWindow
    limit = mockLimit
    constructor(opts: unknown) {
      ratelimitOptions.push(opts)
    }
  },
}))

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor(_opts: unknown) {}
  },
}))

const mockGetHeader = getHeader as ReturnType<typeof vi.fn>

async function loadModule() {
  const mod = await import('./rate-limit')
  return mod.rateLimitByIp
}

function makeEvent(ip?: string) {
  return {
    path: '/api/auth/refresh',
    context: {},
    node: { req: { socket: { remoteAddress: ip ?? '127.0.0.1' } } },
  } as any
}

describe('server/utils/rate-limit', () => {
  let savedUrl: string | undefined
  let savedToken: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    mockLimit.mockResolvedValue({ success: true })
    savedUrl = process.env.UPSTASH_REDIS_REST_URL
    savedToken = process.env.UPSTASH_REDIS_REST_TOKEN
    vi.resetModules()
  })

  afterEach(() => {
    if (savedUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = savedUrl
    else delete process.env.UPSTASH_REDIS_REST_URL
    if (savedToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = savedToken
    else delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  describe('when Upstash is not configured (no-op mode)', () => {
    beforeEach(() => {
      delete process.env.UPSTASH_REDIS_REST_URL
      delete process.env.UPSTASH_REDIS_REST_TOKEN
    })

    test('returns without throwing when env vars are absent', async () => {
      const rateLimitByIp = await loadModule()
      await expect(rateLimitByIp(makeEvent())).resolves.toBeUndefined()
    })

    test('does not call the rate limiter when env vars are absent', async () => {
      const rateLimitByIp = await loadModule()
      await rateLimitByIp(makeEvent())
      expect(mockLimit).not.toHaveBeenCalled()
    })
  })

  describe('when Upstash is configured', () => {
    beforeEach(() => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io'
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    })

    test('calls ratelimit.limit with the x-forwarded-for IP', async () => {
      mockGetHeader.mockReturnValueOnce('1.2.3.4')
      const rateLimitByIp = await loadModule()
      await rateLimitByIp(makeEvent())
      expect(mockLimit).toHaveBeenCalledWith('1.2.3.4')
    })

    test('uses first IP when x-forwarded-for is comma-separated', async () => {
      mockGetHeader.mockReturnValueOnce('5.5.5.5, 10.0.0.1, 192.168.1.1')
      const rateLimitByIp = await loadModule()
      await rateLimitByIp(makeEvent())
      expect(mockLimit).toHaveBeenCalledWith('5.5.5.5')
    })

    test('falls back to socket remoteAddress when no x-forwarded-for', async () => {
      mockGetHeader.mockReturnValueOnce(null)
      const rateLimitByIp = await loadModule()
      await rateLimitByIp(makeEvent('9.9.9.9'))
      expect(mockLimit).toHaveBeenCalledWith('9.9.9.9')
    })

    test('throws 429 when rate limit is exceeded', async () => {
      mockLimit.mockResolvedValueOnce({ success: false })
      const rateLimitByIp = await loadModule()
      await expect(rateLimitByIp(makeEvent())).rejects.toMatchObject({ statusCode: 429, statusMessage: 'Too many requests' })
    })

    test('does not throw when request is within rate limit', async () => {
      mockLimit.mockResolvedValueOnce({ success: true })
      const rateLimitByIp = await loadModule()
      await expect(rateLimitByIp(makeEvent())).resolves.toBeUndefined()
    })
  })
})

describe('rateLimitByKey', () => {
  let savedUrl: string | undefined
  let savedToken: string | undefined

  async function load() {
    return (await import('./rate-limit')).rateLimitByKey
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ratelimitOptions.length = 0
    mockLimit.mockResolvedValue({ success: true })
    savedUrl = process.env.UPSTASH_REDIS_REST_URL
    savedToken = process.env.UPSTASH_REDIS_REST_TOKEN
    vi.resetModules()
  })

  afterEach(() => {
    if (savedUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = savedUrl
    else delete process.env.UPSTASH_REDIS_REST_URL
    if (savedToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = savedToken
    else delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  test('is a no-op when Upstash is not configured', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    const rateLimitByKey = await load()

    await expect(rateLimitByKey('user-search:alice', 30, '1 m')).resolves.toBeUndefined()
    expect(mockLimit).not.toHaveBeenCalled()
  })

  describe('when Upstash is configured', () => {
    beforeEach(() => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io'
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    })

    test('limits on the given key with the given window', async () => {
      const rateLimitByKey = await load()

      await rateLimitByKey('user-search:alice', 30, '1 m')

      expect(mockSlidingWindow).toHaveBeenCalledWith(30, '1 m')
      expect(mockLimit).toHaveBeenCalledWith('user-search:alice')
    })

    test('reuses one limiter per limit/window pair', async () => {
      const rateLimitByKey = await load()

      await rateLimitByKey('user-search:alice', 30, '1 m')
      await rateLimitByKey('user-search:bob', 30, '1 m')
      await rateLimitByKey('follow:alice', 20, '1 h')

      expect(ratelimitOptions).toHaveLength(2)
    })

    test('does not share counters with the auth IP limiter', async () => {
      const rateLimitByKey = await load()

      await rateLimitByKey('user-search:alice', 30, '1 m')

      expect(ratelimitOptions[0]).toMatchObject({ prefix: 'ratelimit:30/1 m' })
    })

    test('throws 429 when the limit is exceeded', async () => {
      mockLimit.mockResolvedValueOnce({ success: false })
      const rateLimitByKey = await load()

      await expect(rateLimitByKey('user-search:alice', 30, '1 m')).rejects.toMatchObject({ statusCode: 429 })
    })
  })
})
