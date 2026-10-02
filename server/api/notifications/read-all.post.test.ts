import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './read-all.post'

const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockUpdateMany = prisma.notification.updateMany as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }

function call(body: unknown) {
  mockReadBody.mockResolvedValue(body)
  return (handler as unknown as (e: Event) => Promise<unknown>)({ path: '/api/notifications/read-all', context: { userId: 'me' } })
}

describe('POST /api/notifications/read-all', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateMany.mockResolvedValue({ count: 3 })
  })

  test('marks every unread notification created up to `before` as read', async () => {
    const before = '2026-10-02T12:00:00.000Z'
    await expect(call({ before })).resolves.toEqual({ count: 3 })
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { recipientId: 'me', readAt: null, createdAt: { lte: new Date(before) } },
      data: { readAt: expect.any(Date) },
    })
  })

  test('without `before`, everything up to now', async () => {
    const start = Date.now()
    await call(undefined)
    const { where } = mockUpdateMany.mock.calls[0]![0]
    expect(where.createdAt.lte.getTime()).toBeGreaterThanOrEqual(start)
  })

  test.each([[{ before: 'yesterday' }], [{ before: 12 }]])('400 on %j', async (body) => {
    await expect(call(body)).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid before timestamp' })
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })

  test('500 with a generic message on a database error', async () => {
    mockUpdateMany.mockRejectedValueOnce(new Error('timeout'))
    await expect(call({})).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to mark notifications read' })
    expect(logger.error).toHaveBeenCalled()
  })
})
