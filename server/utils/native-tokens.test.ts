import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('./prisma', () => ({
  prisma: {
    refreshToken: { create: vi.fn() },
  },
}))

const { issueTokenPair } = await import('./native-tokens')
const { prisma } = await import('./prisma')

const mockCreate = prisma.refreshToken.create as ReturnType<typeof vi.fn>
const mockSignAccessToken = signAccessToken as ReturnType<typeof vi.fn>
const mockGetHeader = getHeader as ReturnType<typeof vi.fn>

function makeEvent() {
  return { path: '/api/auth/native/test', context: {} } as any
}

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Buffer.from(buf).toString('hex')
}

describe('issueTokenPair', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignAccessToken.mockResolvedValue('access-token-xyz')
    mockGetHeader.mockReturnValue('TestApp/1.0')
    mockCreate.mockResolvedValue({})
  })

  test('returns the access token from signAccessToken for the given user', async () => {
    const result = await issueTokenPair(makeEvent(), 'cluser001')
    expect(mockSignAccessToken).toHaveBeenCalledWith('cluser001')
    expect(result.accessToken).toBe('access-token-xyz')
  })

  test('stores the SHA-256 hash of the refresh token, never the raw value', async () => {
    const result = await issueTokenPair(makeEvent(), 'cluser001')
    const createArg = mockCreate.mock.calls[0]?.[0] as { data: { tokenHash: string } }
    // Raw token is 2× UUID = 72 chars; SHA-256 hex is always 64 chars
    expect(result.refreshToken).toHaveLength(72)
    expect(createArg.data.tokenHash).toHaveLength(64)
    expect(createArg.data.tokenHash).toBe(await sha256Hex(result.refreshToken))
  })

  test('creates the record for the given user with a ~30 day expiry', async () => {
    const before = Date.now()
    await issueTokenPair(makeEvent(), 'cluser001')
    const createArg = mockCreate.mock.calls[0]?.[0] as { data: { userId: string; expiresAt: Date } }
    expect(createArg.data.userId).toBe('cluser001')
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
    expect(createArg.data.expiresAt.getTime() - before).toBeGreaterThanOrEqual(thirtyDaysMs - 1000)
    expect(createArg.data.expiresAt.getTime() - before).toBeLessThanOrEqual(thirtyDaysMs + 1000)
  })

  test('stores deviceInfo from the user-agent header', async () => {
    await issueTokenPair(makeEvent(), 'cluser001')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deviceInfo: 'TestApp/1.0' }) }),
    )
  })

  test('stores deviceInfo null when no user-agent header is present', async () => {
    mockGetHeader.mockReturnValueOnce(null)
    await issueTokenPair(makeEvent(), 'cluser001')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deviceInfo: null }) }),
    )
  })

  test('mints a distinct refresh token per call', async () => {
    const first = await issueTokenPair(makeEvent(), 'cluser001')
    const second = await issueTokenPair(makeEvent(), 'cluser001')
    expect(first.refreshToken).not.toBe(second.refreshToken)
  })
})
