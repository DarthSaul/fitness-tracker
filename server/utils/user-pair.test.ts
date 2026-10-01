import { describe, test, expect, vi, beforeEach } from 'vitest'

import { withPairLock } from './user-pair'

const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>
const mockExecuteRaw = prisma.$executeRaw as ReturnType<typeof vi.fn>

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
