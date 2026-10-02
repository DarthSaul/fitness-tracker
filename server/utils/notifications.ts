import type { H3Event } from 'h3'
import type { NotificationType, Prisma } from '@prisma/client'

import { publicUserSelect, type PublicUser } from './public-user'

/**
 * The notifications module (docs/notifications/SPEC-notifications.md).
 *
 * A route that causes a notification calls `notify` inside the transaction that
 * makes the change (an outbox), then `pushAfterCommit` once it has committed.
 * The push is best-effort: a failure leaves `pushedAt` null and the sweep
 * retries it, but never fails the request that caused it.
 */

export type NotificationStatus = 'unread' | 'read' | 'dismissed'

/** Deep-link ids. Each is a real column so a deleted source cascades or can be retracted. */
export interface NotificationTarget {
  postId?: string
  followId?: string
  workoutSessionId?: string
  standaloneSessionId?: string
  scheduledWorkoutId?: string
}

const TARGET_KEYS = ['postId', 'followId', 'workoutSessionId', 'standaloneSessionId', 'scheduledWorkoutId'] as const

export type NotificationData = Record<string, string | number>

export interface NotifyInput {
  recipientId: string
  type: NotificationType
  /** One row per logical event, e.g. `reaction:{postId}:{actorId}`. */
  dedupeKey: string
  /** The user who caused it; omitted for system notifications. */
  actorId?: string
  target?: NotificationTarget
  /** Render snapshot for the client and the push text. Never another user's workout data (ADR 001). */
  data?: NotificationData
}

/**
 * Writes a notification in `db` — pass the caller's transaction. Returns the
 * dedupeKey to hand to `pushAfterCommit`, or null when nothing was written:
 * the actor is the recipient, a block exists either way, or the event was
 * already recorded.
 */
export async function notify(db: Prisma.TransactionClient, input: NotifyInput): Promise<string | null> {
  const { recipientId, actorId, type, dedupeKey, target = {}, data = {} } = input
  if (actorId) {
    if (actorId === recipientId) return null
    if (await isBlockedEitherWay(actorId, recipientId, db)) return null
  }

  // ON CONFLICT DO NOTHING rather than catching P2002: a unique violation
  // inside an interactive transaction aborts the caller's whole transaction.
  const { count } = await db.notification.createMany({
    data: [{ recipientId, actorId: actorId ?? null, type, dedupeKey, ...target, data }],
    skipDuplicates: true,
  })
  if (count === 0) return null

  logger.info({ type, recipientId, dedupeKey }, 'notification.created')
  return dedupeKey
}

/** Deletes notifications whose source no longer stands (e.g. a cancelled follow request). */
export async function retract(db: Prisma.TransactionClient, where: { dedupeKey: string } | { followId: string }): Promise<void> {
  await db.notification.deleteMany({ where })
}

export function notificationStatus(row: { readAt: Date | null; dismissedAt: Date | null }): NotificationStatus {
  if (row.dismissedAt) return 'dismissed'
  return row.readAt ? 'read' : 'unread'
}

/** A recipient's non-dismissed notifications, minus any from a user blocked either way. */
export function inboxWhere(recipientId: string, blockedIds: string[]): Prisma.NotificationWhereInput {
  const where: Prisma.NotificationWhereInput = { recipientId, dismissedAt: null }
  // Blocking deletes the pair's notifications; this hides any that slip past.
  if (blockedIds.length > 0) where.OR = [{ actorId: null }, { actorId: { notIn: blockedIds } }]
  return where
}

/** The badge number. */
export async function unreadCount(recipientId: string): Promise<number> {
  const where = inboxWhere(recipientId, await blockedUserIds(recipientId))
  return prisma.notification.count({ where: { ...where, readAt: null } })
}

export const notificationSelect = {
  id: true,
  type: true,
  createdAt: true,
  readAt: true,
  dismissedAt: true,
  data: true,
  postId: true,
  followId: true,
  workoutSessionId: true,
  standaloneSessionId: true,
  scheduledWorkoutId: true,
  actor: { select: publicUserSelect },
} satisfies Prisma.NotificationSelect

type TargetColumns = { [K in (typeof TARGET_KEYS)[number]]: string | null }

function targetOf(row: TargetColumns): NotificationTarget {
  const target: NotificationTarget = {}
  for (const key of TARGET_KEYS) {
    if (row[key]) target[key] = row[key]
  }
  return target
}

export interface NotificationPayload {
  id: string
  type: NotificationType
  status: NotificationStatus
  createdAt: Date
  readAt: Date | null
  actor: PublicUser | null
  target: NotificationTarget
  data: Prisma.JsonValue
}

export function toNotificationPayload(row: Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>): NotificationPayload {
  return {
    id: row.id,
    type: row.type,
    status: notificationStatus(row),
    createdAt: row.createdAt,
    readAt: row.readAt,
    actor: row.actor,
    target: targetOf(row),
    data: row.data,
  }
}

/**
 * English push text. The inbox carries `type` + `data` instead, so clients
 * render (and localise) their own copy.
 */
export function pushAlert(type: NotificationType, actorName: string | null, data: Prisma.JsonValue): { title: string; body: string } {
  const who = actorName || 'Someone'
  const d = (data && typeof data === 'object' && !Array.isArray(data) ? data : {}) as Record<string, unknown>
  switch (type) {
    case 'FOLLOW_REQUEST':
      return { title: 'Follow request', body: `${who} wants to follow you` }
    case 'NEW_FOLLOWER':
      return { title: 'New follower', body: `${who} started following you` }
    case 'FOLLOW_ACCEPTED':
      return { title: 'Request accepted', body: `${who} accepted your follow request` }
    case 'POST_REACTION':
      return { title: 'New reaction', body: `${who} reacted ${d.emoji ?? ''} to your post` }
    case 'WORKOUT_REMINDER':
      return { title: 'Workout today', body: `${d.programName} · Week ${d.weekNumber}, Day ${d.dayNumber} is scheduled for today.` }
    case 'WORKOUT_UNFINISHED':
      return { title: 'Still working out?', body: 'You started a workout over 4 hours ago. Tap to finish it.' }
  }
}

export type DeliveryOutcome = PushOutcome | 'skipped'

/**
 * Pushes one notification and records the attempt. `skipped` when there is
 * nothing to do: it was retracted, already pushed, already seen in-app, or the
 * user turned this type's pushes off. Never throws.
 */
export async function deliverPush(dedupeKey: string): Promise<DeliveryOutcome> {
  try {
    const n = await prisma.notification.findUnique({
      where: { dedupeKey },
      select: {
        id: true,
        recipientId: true,
        type: true,
        data: true,
        postId: true,
        followId: true,
        workoutSessionId: true,
        standaloneSessionId: true,
        scheduledWorkoutId: true,
        readAt: true,
        dismissedAt: true,
        pushedAt: true,
        actor: { select: { name: true } },
      },
    })
    if (!n || n.pushedAt || n.readAt || n.dismissedAt) return 'skipped'

    const pref = await prisma.notificationPreference.findUnique({
      where: { userId_type: { userId: n.recipientId, type: n.type } },
      select: { pushEnabled: true },
    })
    if (pref?.pushEnabled === false) {
      // Delivered as far as this user wants it: in the inbox only.
      await prisma.notification.update({ where: { id: n.id }, data: { pushedAt: new Date() } })
      return 'skipped'
    }

    const outcome = await sendPush(n.recipientId, {
      aps: { alert: pushAlert(n.type, n.actor?.name ?? null, n.data), badge: await unreadCount(n.recipientId), sound: 'default' },
      notificationId: n.id,
      type: n.type,
      target: targetOf(n),
    })

    await prisma.notification.update({
      where: { id: n.id },
      data: { pushAttempts: { increment: 1 }, ...(outcome !== 'failed' && { pushedAt: new Date() }) },
    })
    logger.info({ notificationId: n.id, type: n.type, outcome }, 'notification.push')
    return outcome
  } catch (err) {
    logger.error({ err, dedupeKey }, '[notifications] Push delivery failed')
    return 'failed'
  }
}

/**
 * Sends the push once the response is on its way. Call after the transaction
 * that ran `notify` has committed, with what `notify` returned.
 */
export function pushAfterCommit(event: H3Event, dedupeKey: string | null): void {
  if (!dedupeKey) return
  // waitUntil keeps a serverless function alive until the push settles.
  event.waitUntil(deliverPush(dedupeKey))
}
