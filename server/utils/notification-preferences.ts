import { NotificationType } from '@prisma/client'

/** Every notification type, in enum order — the keys of the preferences `push` map. */
export const NOTIFICATION_TYPES = Object.values(NotificationType) as NotificationType[]

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/

/** Minutes after local midnight → `"HH:MM"`. */
export function formatReminderTime(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

/** `"HH:MM"` (24-hour, zero-padded) → minutes after local midnight, or null if malformed. */
export function parseReminderTime(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  const match = HH_MM.exec(raw)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

/**
 * True for a named IANA zone this runtime knows, e.g. `America/Chicago` or
 * `Etc/GMT+5`. Raw offset strings (`+05:30`, `-08:00`) are rejected even though
 * Intl accepts them: a device that sends one has a real zone it could send
 * instead, and a bare offset would miss that zone's DST changes.
 */
export function isValidTimeZone(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw === '') return false
  if (raw.startsWith('+') || raw.startsWith('-')) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: raw })
    return true
  } catch {
    return false
  }
}

export interface NotificationPreferences {
  push: Record<NotificationType, boolean>
  timezone: string | null
  workoutReminderTime: string
}

/** The caller's settings with defaults filled in: a type with no row has push on. */
export async function loadNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const [user, rows] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true, workoutReminderMinute: true } }),
    prisma.notificationPreference.findMany({ where: { userId }, select: { type: true, pushEnabled: true } }),
  ])
  const push = Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, true])) as Record<NotificationType, boolean>
  for (const row of rows) push[row.type] = row.pushEnabled
  return {
    push,
    timezone: user?.timezone ?? null,
    workoutReminderTime: formatReminderTime(user?.workoutReminderMinute ?? 480),
  }
}
