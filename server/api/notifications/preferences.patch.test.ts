import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './preferences.patch'

const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>
const mockUpsert = prisma.notificationPreference.upsert as ReturnType<typeof vi.fn>
const mockUserUpdate = prisma.user.update as ReturnType<typeof vi.fn>
const mockUserFind = prisma.user.findUnique as ReturnType<typeof vi.fn>
const mockPrefFind = prisma.notificationPreference.findMany as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }

function call(body: unknown) {
  mockReadBody.mockResolvedValue(body)
  return (handler as unknown as (e: Event) => Promise<unknown>)({ path: '/api/notifications/preferences', context: { userId: 'me' } })
}

describe('PATCH /api/notifications/preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Array form: resolve every queued write.
    mockTransaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops))
    mockUpsert.mockResolvedValue({})
    mockUserUpdate.mockResolvedValue({})
    mockUserFind.mockResolvedValue({ timezone: 'Europe/London', workoutReminderMinute: 1110 })
    mockPrefFind.mockResolvedValue([{ type: 'POST_REACTION', pushEnabled: false }])
  })

  test('applies push toggles, timezone and reminder time in one transaction, and returns the full settings', async () => {
    const result = await call({ push: { POST_REACTION: false }, timezone: 'Europe/London', workoutReminderTime: '18:30' })

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { userId_type: { userId: 'me', type: 'POST_REACTION' } },
      create: { userId: 'me', type: 'POST_REACTION', pushEnabled: false },
      update: { pushEnabled: false },
    })
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'me' },
      data: { timezone: 'Europe/London', workoutReminderMinute: 1110 },
      select: { id: true },
    })
    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ timezone: 'Europe/London', workoutReminderTime: '18:30', push: { POST_REACTION: false, NEW_FOLLOWER: true } })
  })

  test('a partial body touches only what it names', async () => {
    await call({ timezone: null })
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(mockUserUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { timezone: null } }))
  })

  test('push toggles alone do not write the user row', async () => {
    await call({ push: { NEW_FOLLOWER: true } })
    expect(mockUpsert).toHaveBeenCalledTimes(1)
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  test.each([
    [null, 'Body must be an object'],
    [[], 'Body must be an object'],
    [{}, 'Nothing to update'],
    [{ push: {} }, 'Nothing to update'],
    [{ unknownField: true }, 'Nothing to update'],
    [{ timezone: '-06:00' }, 'timezone must be an IANA time zone or null'],
    [{ push: 'off' }, 'push must be an object of type → boolean'],
    [{ push: { NOT_A_TYPE: true } }, 'Unknown notification type: NOT_A_TYPE'],
    [{ push: { POST_REACTION: 'no' } }, 'push.POST_REACTION must be a boolean'],
    [{ timezone: 'Mars/Olympus' }, 'timezone must be an IANA time zone or null'],
    [{ workoutReminderTime: '25:00' }, 'workoutReminderTime must be HH:MM (24-hour)'],
  ])('400 on %j', async (body, message) => {
    await expect(call(body)).rejects.toMatchObject({ statusCode: 400, statusMessage: message })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  test('500 with a generic message on a database error', async () => {
    mockTransaction.mockRejectedValueOnce(new Error('timeout'))
    await expect(call({ timezone: 'UTC' })).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to update notification preferences' })
    expect(logger.error).toHaveBeenCalled()
  })
})
