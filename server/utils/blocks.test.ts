import { describe, test, expect, vi, beforeEach } from 'vitest'

import { isBlockedEitherWay, blockedUserIds } from './blocks'

const mockFindFirst = prisma.userBlock.findFirst as ReturnType<typeof vi.fn>
const mockFindMany = prisma.userBlock.findMany as ReturnType<typeof vi.fn>

describe('isBlockedEitherWay', () => {
  beforeEach(() => vi.clearAllMocks())

  test('queries both directions of the pair', async () => {
    mockFindFirst.mockResolvedValueOnce(null)

    await isBlockedEitherWay('alice', 'bob')

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { blockerId: 'alice', blockedId: 'bob' },
          { blockerId: 'bob', blockedId: 'alice' },
        ],
      },
      select: { id: true },
    })
  })

  test('is true when a block row exists', async () => {
    mockFindFirst.mockResolvedValueOnce({ id: 'blk1' })
    expect(await isBlockedEitherWay('alice', 'bob')).toBe(true)
  })

  test('is false when no block row exists', async () => {
    mockFindFirst.mockResolvedValueOnce(null)
    expect(await isBlockedEitherWay('alice', 'bob')).toBe(false)
  })

  test('is false for the same user without querying', async () => {
    expect(await isBlockedEitherWay('alice', 'alice')).toBe(false)
    expect(mockFindFirst).not.toHaveBeenCalled()
  })
})

describe('blockedUserIds', () => {
  beforeEach(() => vi.clearAllMocks())

  test('returns the other party of blocks made and received, deduplicated', async () => {
    mockFindMany.mockResolvedValueOnce([
      { blockerId: 'alice', blockedId: 'bob' },
      { blockerId: 'carol', blockedId: 'alice' },
      { blockerId: 'bob', blockedId: 'alice' },
    ])

    const ids = await blockedUserIds('alice')

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { OR: [{ blockerId: 'alice' }, { blockedId: 'alice' }] },
      select: { blockerId: true, blockedId: true },
    })
    expect(ids.sort()).toEqual(['bob', 'carol'])
  })

  test('returns an empty list when there are no blocks', async () => {
    mockFindMany.mockResolvedValueOnce([])
    expect(await blockedUserIds('alice')).toEqual([])
  })
})
