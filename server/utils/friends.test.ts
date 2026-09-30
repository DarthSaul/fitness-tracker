import { describe, test, expect, vi, beforeEach } from 'vitest'

import { orderedPair, areFriends, relationshipsWith, friendsOf, withPairLock } from './friends'

const mockFindUnique = prisma.friendship.findUnique as ReturnType<typeof vi.fn>
const mockFindMany = prisma.friendship.findMany as ReturnType<typeof vi.fn>
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>
const mockExecuteRaw = prisma.$executeRaw as ReturnType<typeof vi.fn>

describe('orderedPair', () => {
  test('sorts the pair regardless of argument order', () => {
    expect(orderedPair('cb', 'ca')).toEqual({ userLowId: 'ca', userHighId: 'cb' })
    expect(orderedPair('ca', 'cb')).toEqual({ userLowId: 'ca', userHighId: 'cb' })
  })

  test('uses byte order (digits before letters), matching the COLLATE "C" CHECK', () => {
    expect(orderedPair('cz', 'c9')).toEqual({ userLowId: 'c9', userHighId: 'cz' })
  })
})

describe('areFriends', () => {
  beforeEach(() => vi.clearAllMocks())

  test('looks the pair up by its sorted key', async () => {
    mockFindUnique.mockResolvedValueOnce(null)

    await areFriends('cb', 'ca')

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { userLowId_userHighId: { userLowId: 'ca', userHighId: 'cb' } },
      select: { status: true },
    })
  })

  test.each([
    ['an ACCEPTED row', { status: 'ACCEPTED' }, true],
    ['a PENDING row', { status: 'PENDING' }, false],
    ['no row', null, false],
  ])('%s → %s', async (_label, row, expected) => {
    mockFindUnique.mockResolvedValueOnce(row)
    expect(await areFriends('ca', 'cb')).toBe(expected)
  })

  test('a user is not their own friend, and nothing is queried', async () => {
    expect(await areFriends('ca', 'ca')).toBe(false)
    expect(mockFindUnique).not.toHaveBeenCalled()
  })
})

describe('relationshipsWith', () => {
  beforeEach(() => vi.clearAllMocks())

  test('resolves every state in one query, whichever side of the pair the caller is', async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 'f1', userLowId: 'cm', userHighId: 'cz', requesterId: 'cz', status: 'ACCEPTED' }, // me is high
      { id: 'f2', userLowId: 'ca', userHighId: 'cm', requesterId: 'cm', status: 'PENDING' }, // I sent
      { id: 'f3', userLowId: 'cm', userHighId: 'cp', requesterId: 'cp', status: 'PENDING' }, // they sent
    ])

    const result = await relationshipsWith('cm', ['cz', 'ca', 'cp', 'cq', 'cm'])

    expect(mockFindMany).toHaveBeenCalledTimes(1)
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { userLowId: 'cm', userHighId: { in: ['cz', 'ca', 'cp', 'cq'] } },
          { userHighId: 'cm', userLowId: { in: ['cz', 'ca', 'cp', 'cq'] } },
        ],
      },
      select: { id: true, userLowId: true, userHighId: true, requesterId: true, status: true },
    })
    expect(Object.fromEntries(result)).toEqual({
      cz: { relationship: 'friends' },
      ca: { relationship: 'request_sent', requestId: 'f2' },
      cp: { relationship: 'request_received', requestId: 'f3' },
      cq: { relationship: 'none' },
      cm: { relationship: 'self' },
    })
  })

  test('skips the query when there is nobody but the caller', async () => {
    const result = await relationshipsWith('cm', ['cm'])

    expect(mockFindMany).not.toHaveBeenCalled()
    expect(result.get('cm')).toEqual({ relationship: 'self' })
  })

  test('deduplicates ids', async () => {
    mockFindMany.mockResolvedValueOnce([])

    await relationshipsWith('cm', ['ca', 'ca'])

    expect(mockFindMany.mock.calls[0]![0].where.OR[0].userHighId.in).toEqual(['ca'])
  })
})

describe('friendsOf', () => {
  test('matches users with an ACCEPTED row on either side of the pair', () => {
    expect(friendsOf('cm')).toEqual({
      OR: [
        { friendshipsAsLow: { some: { userHighId: 'cm', status: 'ACCEPTED' } } },
        { friendshipsAsHigh: { some: { userLowId: 'cm', status: 'ACCEPTED' } } },
      ],
    })
  })
})

describe('withPairLock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTransaction.mockImplementation((fn: (tx: unknown) => unknown) => fn({ $executeRaw: mockExecuteRaw, tag: 'tx' }))
    mockExecuteRaw.mockResolvedValue(1)
  })

  test('takes a transaction-scoped advisory lock on the sorted pair before running the callback', async () => {
    const order: string[] = []
    mockExecuteRaw.mockImplementationOnce(async () => { order.push('lock'); return 1 })

    const result = await withPairLock('cz', 'ca', async (tx) => {
      order.push('callback')
      return (tx as unknown as { tag: string }).tag
    })

    expect(order).toEqual(['lock', 'callback'])
    expect(result).toBe('tx')
    const [strings, ...values] = mockExecuteRaw.mock.calls[0]!
    expect((strings as string[]).join('?')).toContain('pg_advisory_xact_lock')
    // Sorted, so A→B and B→A contend for the same lock.
    expect(values).toEqual(['ca', 'cz'])
  })

  test('the same pair in either order produces the same lock key', async () => {
    await withPairLock('ca', 'cz', async () => null)
    await withPairLock('cz', 'ca', async () => null)

    expect(mockExecuteRaw.mock.calls[0]!.slice(1)).toEqual(mockExecuteRaw.mock.calls[1]!.slice(1))
  })

  test('propagates errors from the callback (the transaction rolls back)', async () => {
    await expect(withPairLock('ca', 'cz', async () => { throw new Error('boom') })).rejects.toThrow('boom')
  })
})
