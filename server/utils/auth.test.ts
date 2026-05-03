import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('./prisma', () => ({
  prisma: {
    identity: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

const { findOrLinkUser } = await import('./auth')
const { prisma } = await import('./prisma')

const mockIdentityFindUnique = prisma.identity.findUnique as ReturnType<typeof vi.fn>
const mockUserUpdate = prisma.user.update as ReturnType<typeof vi.fn>
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>

const baseProfile = {
  provider: 'google' as const,
  providerId: 'google-sub-001',
  email: 'alice@example.com',
  name: 'Alice',
  avatarUrl: 'https://example.com/alice.jpg',
}

const baseUser = {
  id: 'cluser001',
  email: 'alice@example.com',
  name: 'Alice',
  avatarUrl: 'https://example.com/alice.jpg',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('findOrLinkUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('existing Identity → returns its User and refreshes profile fields', async () => {
    mockIdentityFindUnique.mockResolvedValueOnce({
      id: 'clid001',
      userId: 'cluser001',
      provider: 'google',
      providerId: 'google-sub-001',
      createdAt: new Date(),
    })
    mockUserUpdate.mockResolvedValueOnce(baseUser)

    const result = await findOrLinkUser(baseProfile)

    expect(mockIdentityFindUnique).toHaveBeenCalledWith({
      where: { provider_providerId: { provider: 'google', providerId: 'google-sub-001' } },
    })
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'cluser001' },
      data: { email: 'alice@example.com', name: 'Alice', avatarUrl: 'https://example.com/alice.jpg' },
    })
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(result).toEqual(baseUser)
  })

  test('no Identity, User with same email exists → links and returns existing User', async () => {
    mockIdentityFindUnique.mockResolvedValueOnce(null)

    const txIdentityCreate = vi.fn().mockResolvedValue({ id: 'clid002' })
    const txUserUpdate = vi.fn().mockResolvedValue(baseUser)
    const txUserFindUnique = vi.fn().mockResolvedValue(baseUser)
    const txUserCreate = vi.fn()

    mockTransaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        identity: { create: txIdentityCreate },
        user: { findUnique: txUserFindUnique, update: txUserUpdate, create: txUserCreate },
      }),
    )

    const result = await findOrLinkUser({ ...baseProfile, provider: 'apple', providerId: 'apple-sub-001' })

    expect(txUserFindUnique).toHaveBeenCalledWith({ where: { email: 'alice@example.com' } })
    expect(txIdentityCreate).toHaveBeenCalledWith({
      data: { userId: 'cluser001', provider: 'apple', providerId: 'apple-sub-001' },
    })
    expect(txUserCreate).not.toHaveBeenCalled()
    expect(result).toEqual(baseUser)
  })

  test('no Identity, no User with email → creates User + Identity in transaction', async () => {
    mockIdentityFindUnique.mockResolvedValueOnce(null)

    const txUserFindUnique = vi.fn().mockResolvedValue(null)
    const txUserCreate = vi.fn().mockResolvedValue({ ...baseUser, id: 'cluser-new' })
    const txIdentityCreate = vi.fn()
    const txUserUpdate = vi.fn()

    mockTransaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        identity: { create: txIdentityCreate },
        user: { findUnique: txUserFindUnique, update: txUserUpdate, create: txUserCreate },
      }),
    )

    const result = await findOrLinkUser(baseProfile)

    expect(txUserCreate).toHaveBeenCalledWith({
      data: {
        email: 'alice@example.com',
        name: 'Alice',
        avatarUrl: 'https://example.com/alice.jpg',
        identities: {
          create: { provider: 'google', providerId: 'google-sub-001' },
        },
      },
    })
    expect(txIdentityCreate).not.toHaveBeenCalled()
    expect(result.id).toBe('cluser-new')
  })

  test('does not overwrite existing User name/avatar with null when linking', async () => {
    mockIdentityFindUnique.mockResolvedValueOnce(null)

    const txIdentityCreate = vi.fn().mockResolvedValue({})
    const txUserUpdate = vi.fn().mockResolvedValue(baseUser)
    const txUserFindUnique = vi.fn().mockResolvedValue(baseUser)
    const txUserCreate = vi.fn()

    mockTransaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        identity: { create: txIdentityCreate },
        user: { findUnique: txUserFindUnique, update: txUserUpdate, create: txUserCreate },
      }),
    )

    await findOrLinkUser({
      provider: 'apple',
      providerId: 'apple-sub-002',
      email: 'alice@example.com',
      name: null,
      avatarUrl: null,
    })

    const updateArg = txUserUpdate.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    expect(updateArg.data).not.toHaveProperty('name')
    expect(updateArg.data).not.toHaveProperty('avatarUrl')
  })

  test('passes through name=undefined as no-op on existing Identity', async () => {
    mockIdentityFindUnique.mockResolvedValueOnce({
      id: 'clid003',
      userId: 'cluser001',
      provider: 'apple',
      providerId: 'apple-sub-003',
      createdAt: new Date(),
    })
    mockUserUpdate.mockResolvedValueOnce(baseUser)

    await findOrLinkUser({ provider: 'apple', providerId: 'apple-sub-003', email: 'alice@example.com' })

    const updateArg = mockUserUpdate.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    expect(updateArg.data).toEqual({ email: 'alice@example.com' })
  })
})
