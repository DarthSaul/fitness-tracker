import { describe, test, expect, vi, beforeEach } from 'vitest'

import {
  notify,
  retract,
  deliverPush,
  pushAfterCommit,
  pushAlert,
  unreadCount,
  inboxWhere,
  toNotificationPayload,
  notificationStatus,
} from './notifications'

const db = prisma as unknown as {
  notification: Record<string, ReturnType<typeof vi.fn>>
  notificationPreference: Record<string, ReturnType<typeof vi.fn>>
}
const mockIsBlocked = isBlockedEitherWay as ReturnType<typeof vi.fn>
const mockBlockedIds = blockedUserIds as ReturnType<typeof vi.fn>
const mockSendPush = sendPush as ReturnType<typeof vi.fn>

const t0 = new Date('2026-10-02T12:00:00.000Z')

describe('notify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsBlocked.mockResolvedValue(false)
    db.notification.createMany!.mockResolvedValue({ count: 1 })
  })

  const reaction = {
    recipientId: 'author',
    actorId: 'ann',
    type: 'POST_REACTION' as const,
    dedupeKey: 'reaction:p1:ann',
    target: { postId: 'p1' },
    data: { emoji: '🔥' },
  }

  test('inserts with ON CONFLICT DO NOTHING in the caller\'s transaction and returns the dedupeKey', async () => {
    const tx = { notification: { createMany: vi.fn().mockResolvedValue({ count: 1 }) } }

    const key = await notify(tx as never, reaction)

    expect(key).toBe('reaction:p1:ann')
    expect(tx.notification.createMany).toHaveBeenCalledWith({
      data: [{
        recipientId: 'author',
        actorId: 'ann',
        type: 'POST_REACTION',
        dedupeKey: 'reaction:p1:ann',
        postId: 'p1',
        data: { emoji: '🔥' },
      }],
      skipDuplicates: true,
    })
    // The block check reads through the same transaction.
    expect(mockIsBlocked).toHaveBeenCalledWith('ann', 'author', tx)
  })

  test('a duplicate event is a no-op and returns null, so nothing is pushed twice', async () => {
    db.notification.createMany!.mockResolvedValueOnce({ count: 0 })
    await expect(notify(prisma as never, reaction)).resolves.toBeNull()
  })

  test('never notifies you of your own action', async () => {
    await expect(notify(prisma as never, { ...reaction, actorId: 'author' })).resolves.toBeNull()
    expect(db.notification.createMany).not.toHaveBeenCalled()
  })

  test('never notifies across a block, in either direction', async () => {
    mockIsBlocked.mockResolvedValueOnce(true)
    await expect(notify(prisma as never, reaction)).resolves.toBeNull()
    expect(db.notification.createMany).not.toHaveBeenCalled()
  })

  test('system notifications (no actor) skip the block check and default data to {}', async () => {
    await notify(prisma as never, {
      recipientId: 'me',
      type: 'WORKOUT_UNFINISHED',
      dedupeKey: 'unfinished:s1',
      target: { workoutSessionId: 's1' },
    })
    expect(mockIsBlocked).not.toHaveBeenCalled()
    expect(db.notification.createMany).toHaveBeenCalledWith({
      data: [{ recipientId: 'me', actorId: null, type: 'WORKOUT_UNFINISHED', dedupeKey: 'unfinished:s1', workoutSessionId: 's1', data: {} }],
      skipDuplicates: true,
    })
  })
})

describe('retract', () => {
  beforeEach(() => vi.clearAllMocks())

  test('deletes by dedupeKey or by followId, in the caller\'s transaction', async () => {
    const tx = { notification: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) } }
    await retract(tx as never, { followId: 'f1' })
    await retract(tx as never, { dedupeKey: 'follow_request:f1' })
    expect(tx.notification.deleteMany).toHaveBeenNthCalledWith(1, { where: { followId: 'f1' } })
    expect(tx.notification.deleteMany).toHaveBeenNthCalledWith(2, { where: { dedupeKey: 'follow_request:f1' } })
  })
})

describe('notificationStatus', () => {
  test('dismissed beats read beats unread', () => {
    expect(notificationStatus({ readAt: null, dismissedAt: null })).toBe('unread')
    expect(notificationStatus({ readAt: t0, dismissedAt: null })).toBe('read')
    expect(notificationStatus({ readAt: null, dismissedAt: t0 })).toBe('dismissed')
    expect(notificationStatus({ readAt: t0, dismissedAt: t0 })).toBe('dismissed')
  })
})

describe('toNotificationPayload', () => {
  test('exposes status, actor, deep-link target ids only, and data', () => {
    const actor = { id: 'ann', name: 'Ann', username: 'ann', avatarUrl: null, profileVisibility: 'PUBLIC' as const }
    expect(toNotificationPayload({
      id: 'n1',
      type: 'POST_REACTION',
      createdAt: t0,
      readAt: null,
      dismissedAt: null,
      actor,
      postId: 'p1',
      followId: null,
      workoutSessionId: null,
      standaloneSessionId: null,
      scheduledWorkoutId: null,
      data: { emoji: '🔥' },
    })).toEqual({
      id: 'n1',
      type: 'POST_REACTION',
      status: 'unread',
      createdAt: t0,
      readAt: null,
      actor,
      target: { postId: 'p1' },
      data: { emoji: '🔥' },
    })
  })
})

describe('inboxWhere', () => {
  test('excludes dismissed, and hides actors blocked either way while keeping system notifications', () => {
    expect(inboxWhere('me', ['bad'])).toEqual({
      recipientId: 'me',
      dismissedAt: null,
      OR: [{ actorId: null }, { actorId: { notIn: ['bad'] } }],
    })
  })

  test('no blocks: no actor filter at all', () => {
    expect(inboxWhere('me', [])).toEqual({ recipientId: 'me', dismissedAt: null })
  })
})

describe('unreadCount', () => {
  beforeEach(() => vi.clearAllMocks())

  test('counts unread, non-dismissed notifications, minus blocked actors', async () => {
    mockBlockedIds.mockResolvedValueOnce(['bad'])
    db.notification.count!.mockResolvedValueOnce(4)

    await expect(unreadCount('me')).resolves.toBe(4)
    expect(db.notification.count).toHaveBeenCalledWith({
      where: { recipientId: 'me', dismissedAt: null, readAt: null, OR: [{ actorId: null }, { actorId: { notIn: ['bad'] } }] },
    })
  })
})

describe('pushAlert', () => {
  test.each([
    ['FOLLOW_REQUEST', 'Ann', {}, 'Ann wants to follow you'],
    ['NEW_FOLLOWER', 'Ann', {}, 'Ann started following you'],
    ['FOLLOW_ACCEPTED', 'Ann', {}, 'Ann accepted your follow request'],
    ['POST_REACTION', 'Ann', { emoji: '🔥' }, 'Ann reacted 🔥 to your post'],
    ['POST_REACTION', null, { emoji: '🔥' }, 'Someone reacted 🔥 to your post'],
    ['WORKOUT_REMINDER', null, { programName: 'Arm Farm', weekNumber: 2, dayNumber: 3 }, 'Arm Farm · Week 2, Day 3 is scheduled for today.'],
    ['WORKOUT_UNFINISHED', null, {}, 'You started a workout over 4 hours ago. Tap to finish it.'],
  ] as const)('%s', (type, name, data, body) => {
    expect(pushAlert(type, name, data).body).toBe(body)
  })
})

describe('deliverPush', () => {
  const row = {
    id: 'n1',
    recipientId: 'author',
    type: 'POST_REACTION',
    data: { emoji: '🔥' },
    postId: 'p1',
    followId: null,
    workoutSessionId: null,
    standaloneSessionId: null,
    scheduledWorkoutId: null,
    readAt: null,
    dismissedAt: null,
    pushedAt: null,
    actor: { name: 'Ann' },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockBlockedIds.mockResolvedValue([])
    db.notification.findUnique!.mockResolvedValue(row)
    db.notification.count!.mockResolvedValue(3)
    db.notification.update!.mockResolvedValue({})
    db.notificationPreference.findUnique!.mockResolvedValue(null)
    mockSendPush.mockResolvedValue('sent')
  })

  test('sends the alert with badge and deep-link keys, then stamps pushedAt', async () => {
    await expect(deliverPush('reaction:p1:ann')).resolves.toBe('sent')

    expect(mockSendPush).toHaveBeenCalledWith('author', {
      aps: { alert: { title: 'New reaction', body: 'Ann reacted 🔥 to your post' }, badge: 3, sound: 'default' },
      notificationId: 'n1',
      type: 'POST_REACTION',
      target: { postId: 'p1' },
    })
    expect(db.notification.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { pushAttempts: { increment: 1 }, pushedAt: expect.any(Date) },
    })
    expect(logger.info).toHaveBeenCalledWith(
      { notificationId: 'n1', type: 'POST_REACTION', outcome: 'sent' },
      'notification.push',
    )
  })

  test('no device also completes delivery: nothing to retry', async () => {
    mockSendPush.mockResolvedValueOnce('no_device')
    await deliverPush('k')
    expect(db.notification.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { pushAttempts: { increment: 1 }, pushedAt: expect.any(Date) },
    })
  })

  test('a failed push counts the attempt but leaves pushedAt null for the sweep to retry', async () => {
    mockSendPush.mockResolvedValueOnce('failed')
    await expect(deliverPush('k')).resolves.toBe('failed')
    expect(db.notification.update).toHaveBeenCalledWith({ where: { id: 'n1' }, data: { pushAttempts: { increment: 1 } } })
  })

  test('push disabled for this type: completes without sending', async () => {
    db.notificationPreference.findUnique!.mockResolvedValueOnce({ pushEnabled: false })

    await expect(deliverPush('k')).resolves.toBe('skipped')
    expect(db.notificationPreference.findUnique).toHaveBeenCalledWith({
      where: { userId_type: { userId: 'author', type: 'POST_REACTION' } },
      select: { pushEnabled: true },
    })
    expect(mockSendPush).not.toHaveBeenCalled()
    expect(db.notification.update).toHaveBeenCalledWith({ where: { id: 'n1' }, data: { pushedAt: expect.any(Date) } })
  })

  test.each([
    ['gone (retracted)', null],
    ['already pushed', { ...row, pushedAt: t0 }],
    ['already read in-app', { ...row, readAt: t0 }],
    ['dismissed', { ...row, dismissedAt: t0 }],
  ])('skips when %s', async (_label, found) => {
    db.notification.findUnique!.mockResolvedValueOnce(found)
    await expect(deliverPush('k')).resolves.toBe('skipped')
    expect(mockSendPush).not.toHaveBeenCalled()
  })

  test('never throws: a database error is logged and reported as failed', async () => {
    const err = new Error('db down')
    db.notification.findUnique!.mockRejectedValueOnce(err)
    await expect(deliverPush('k')).resolves.toBe('failed')
    expect(logger.error).toHaveBeenCalledWith({ err, dedupeKey: 'k' }, '[notifications] Push delivery failed')
  })
})

describe('pushAfterCommit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.notification.findUnique!.mockResolvedValue(null)
  })

  test('hands the delivery to event.waitUntil so the response is not delayed', () => {
    const waitUntil = vi.fn()
    pushAfterCommit({ waitUntil } as never, 'k')
    expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise))
  })

  test('does nothing when notify skipped the notification', () => {
    const waitUntil = vi.fn()
    pushAfterCommit({ waitUntil } as never, null)
    expect(waitUntil).not.toHaveBeenCalled()
    expect(db.notification.findUnique).not.toHaveBeenCalled()
  })
})
