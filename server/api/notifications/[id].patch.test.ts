import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[id].patch'

const mockParam = getRouterParam as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockFindFirst = prisma.notification.findFirst as ReturnType<typeof vi.fn>
const mockUpdate = prisma.notification.update as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }

const t0 = new Date('2026-10-01T09:00:00.000Z')
const base = {
  id: 'n1', type: 'NEW_FOLLOWER', createdAt: t0, readAt: null, dismissedAt: null, data: {},
  postId: null, followId: null, workoutSessionId: null, standaloneSessionId: null, scheduledWorkoutId: null, actor: null,
}

function call(body: unknown, id: string | undefined = 'n1') {
  mockParam.mockReturnValue(id)
  mockReadBody.mockResolvedValue(body)
  return (handler as unknown as (e: Event) => Promise<unknown>)({ path: `/api/notifications/${id}`, context: { userId: 'me' } })
}

describe('PATCH /api/notifications/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindFirst.mockResolvedValue({ readAt: null })
    mockUpdate.mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...base, ...data }))
  })

  test('looks the notification up by id AND recipient, so another user\'s is 404', async () => {
    mockFindFirst.mockResolvedValueOnce(null)
    await expect(call({ status: 'read' })).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Notification not found' })
    expect(mockFindFirst).toHaveBeenCalledWith({ where: { id: 'n1', recipientId: 'me' }, select: { readAt: true } })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test('read: stamps readAt and clears a dismissal', async () => {
    const result = await call({ status: 'read' })
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { readAt: expect.any(Date), dismissedAt: null },
      select: notificationSelect,
    })
    expect(result).toMatchObject({ notification: { id: 'n1', status: 'read' } })
  })

  test('read keeps the original readAt when already read', async () => {
    mockFindFirst.mockResolvedValueOnce({ readAt: t0 })
    await call({ status: 'read' })
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { readAt: t0, dismissedAt: null } }))
  })

  test('unread: clears both timestamps', async () => {
    const result = await call({ status: 'unread' })
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { readAt: null, dismissedAt: null } }))
    expect(result).toMatchObject({ notification: { status: 'unread' } })
  })

  test('dismissed: stamps dismissedAt and also marks it read, so it leaves the badge', async () => {
    const result = await call({ status: 'dismissed' })
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { readAt: expect.any(Date), dismissedAt: expect.any(Date) } }))
    expect(result).toMatchObject({ notification: { status: 'dismissed' } })
  })

  test.each([[{}], [{ status: 'archived' }], [{ status: 1 }], [null]])('400 on body %j', async (body) => {
    await expect(call(body)).rejects.toMatchObject({ statusCode: 400, statusMessage: 'status must be read, unread or dismissed' })
    expect(mockFindFirst).not.toHaveBeenCalled()
  })

  test('400 on a missing id', async () => {
    await expect(call({ status: 'read' }, '  ')).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing notification id' })
  })

  test('500 with a generic message on a database error', async () => {
    mockFindFirst.mockRejectedValueOnce(new Error('timeout'))
    await expect(call({ status: 'read' })).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to update notification' })
    expect(logger.error).toHaveBeenCalled()
  })
})
