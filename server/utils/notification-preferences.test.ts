import { describe, test, expect, vi, beforeEach } from 'vitest'

import {
  NOTIFICATION_TYPES,
  formatReminderTime,
  parseReminderTime,
  isValidTimeZone,
  loadNotificationPreferences,
} from './notification-preferences'

const mockUserFind = prisma.user.findUnique as ReturnType<typeof vi.fn>
const mockPrefFind = (prisma as unknown as { notificationPreference: { findMany: ReturnType<typeof vi.fn> } }).notificationPreference.findMany

describe('NOTIFICATION_TYPES', () => {
  test('mirrors the Prisma enum', () => {
    expect(NOTIFICATION_TYPES).toEqual([
      'FOLLOW_REQUEST', 'NEW_FOLLOWER', 'FOLLOW_ACCEPTED', 'POST_REACTION', 'WORKOUT_REMINDER', 'WORKOUT_UNFINISHED',
    ])
  })
})

describe('reminder time', () => {
  test.each([[0, '00:00'], [480, '08:00'], [1439, '23:59'], [605, '10:05']])('%i ⇄ %s', (minute, text) => {
    expect(formatReminderTime(minute)).toBe(text)
    expect(parseReminderTime(text)).toBe(minute)
  })

  test.each(['24:00', '8:00', '08:60', '0800', '', ' 08:00', 480, null])('rejects %j', (raw) => {
    expect(parseReminderTime(raw)).toBeNull()
  })
})

describe('isValidTimeZone', () => {
  test.each(['America/Chicago', 'Europe/London', 'UTC', 'Asia/Kolkata', 'Etc/GMT+5'])('accepts %s', (tz) => {
    expect(isValidTimeZone(tz)).toBe(true)
  })

  // Intl (Node 24) accepts fixed UTC offsets as time zones, but an offset has no
  // DST rules: a "-06:00" user's 08:00 reminder would drift an hour each spring.
  test.each(['+05:30', '-08:00', '+0530', '+05'])('rejects the fixed offset %s', (tz) => {
    expect(isValidTimeZone(tz)).toBe(false)
  })

  test.each(['Mars/Olympus', '', 'not a zone', 42, null])('rejects %j', (tz) => {
    expect(isValidTimeZone(tz)).toBe(false)
  })
})

describe('loadNotificationPreferences', () => {
  beforeEach(() => vi.clearAllMocks())

  test('every type is listed; a missing row means push is on', async () => {
    mockUserFind.mockResolvedValueOnce({ timezone: 'America/Chicago', workoutReminderMinute: 450 })
    mockPrefFind.mockResolvedValueOnce([{ type: 'POST_REACTION', pushEnabled: false }])

    await expect(loadNotificationPreferences('me')).resolves.toEqual({
      push: {
        FOLLOW_REQUEST: true,
        NEW_FOLLOWER: true,
        FOLLOW_ACCEPTED: true,
        POST_REACTION: false,
        WORKOUT_REMINDER: true,
        WORKOUT_UNFINISHED: true,
      },
      timezone: 'America/Chicago',
      workoutReminderTime: '07:30',
    })
    expect(mockUserFind).toHaveBeenCalledWith({ where: { id: 'me' }, select: { timezone: true, workoutReminderMinute: true } })
    expect(mockPrefFind).toHaveBeenCalledWith({ where: { userId: 'me' }, select: { type: true, pushEnabled: true } })
  })
})
