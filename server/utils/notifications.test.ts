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
  notifyEach,
  clearNotificationsBetween,
  notificationKeys,
  notifySystem,
  dismissUnfinishedReminder,
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

  test('deletes by dedupeKey or by followId (one or many), in the caller\'s transaction', async () => {
    const tx = { notification: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) } }
    await retract(tx as never, { followId: 'f1' })
    await retract(tx as never, { dedupeKey: 'follow_request:a:b' })
    await retract(tx as never, { followId: { in: ['f1', 'f2'] } })
    expect(tx.notification.deleteMany).toHaveBeenNthCalledWith(1, { where: { followId: 'f1' } })
    expect(tx.notification.deleteMany).toHaveBeenNthCalledWith(2, { where: { dedupeKey: 'follow_request:a:b' } })
    expect(tx.notification.deleteMany).toHaveBeenNthCalledWith(3, { where: { followId: { in: ['f1', 'f2'] } } })
  })
})

describe('notificationKeys', () => {
  test('one key per logical event', () => {
    expect(notificationKeys.followRequest('a', 'b')).toBe('follow_request:a:b')
    expect(notificationKeys.newFollower('a', 'b')).toBe('new_follower:a:b')
    expect(notificationKeys.followAccepted('f1')).toBe('follow_accepted:f1')
    expect(notificationKeys.reaction('p1', 'a')).toBe('reaction:p1:a')
    expect(notificationKeys.unfinished('s1')).toBe('unfinished:s1')
    expect(notificationKeys.reminder('sw1')).toBe('reminder:sw1')
  })
})

describe('notifyEach', () => {
  const tx = {
    userBlock: { findMany: vi.fn() },
    notification: { createManyAndReturn: vi.fn() },
  }
  const input = (recipientId: string) => ({
    recipientId,
    type: 'FOLLOW_ACCEPTED' as const,
    dedupeKey: `follow_accepted:${recipientId}`,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    tx.userBlock.findMany.mockResolvedValue([])
    tx.notification.createManyAndReturn.mockImplementation(({ data }: { data: { dedupeKey: string }[] }) =>
      Promise.resolve(data.map(({ dedupeKey }) => ({ dedupeKey }))))
  })

  test('one block query and one insert for many recipients; returns the keys actually created', async () => {
    const keys = await notifyEach(tx as never, 'me', [input('a'), input('b')])

    expect(keys).toEqual(['follow_accepted:a', 'follow_accepted:b'])
    expect(tx.userBlock.findMany).toHaveBeenCalledWith({
      where: { OR: [{ blockerId: 'me', blockedId: { in: ['a', 'b'] } }, { blockedId: 'me', blockerId: { in: ['a', 'b'] } }] },
      select: { blockerId: true, blockedId: true },
    })
    expect(tx.notification.createManyAndReturn).toHaveBeenCalledWith({
      data: [
        { recipientId: 'a', actorId: 'me', type: 'FOLLOW_ACCEPTED', dedupeKey: 'follow_accepted:a', data: {} },
        { recipientId: 'b', actorId: 'me', type: 'FOLLOW_ACCEPTED', dedupeKey: 'follow_accepted:b', data: {} },
      ],
      skipDuplicates: true,
      select: { dedupeKey: true },
    })
  })

  test('drops recipients blocked either way, and the actor themselves', async () => {
    tx.userBlock.findMany.mockResolvedValueOnce([{ blockerId: 'a', blockedId: 'me' }])
    await notifyEach(tx as never, 'me', [input('a'), input('me'), input('c')])
    expect(tx.notification.createManyAndReturn.mock.calls[0]![0].data.map((d: { recipientId: string }) => d.recipientId)).toEqual(['c'])
  })

  test('nothing to write: no insert', async () => {
    await expect(notifyEach(tx as never, 'me', [])).resolves.toEqual([])
    expect(tx.notification.createManyAndReturn).not.toHaveBeenCalled()
  })
})

describe('clearNotificationsBetween', () => {
  test('deletes what each user caused for the other', async () => {
    const tx = { notification: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) } }
    await clearNotificationsBetween(tx as never, 'a', 'b')
    expect(tx.notification.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ recipientId: 'a', actorId: 'b' }, { recipientId: 'b', actorId: 'a' }] },
    })
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
    pushAttempts: 0,
    actorId: 'ann',
    actor: { name: 'Ann' },
    workoutSession: null,
    standaloneSession: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockBlockedIds.mockResolvedValue([])
    mockIsBlocked.mockResolvedValue(false)
    db.notification.deleteMany!.mockResolvedValue({ count: 1 })
    db.notification.findUnique!.mockResolvedValue(row)
    db.notification.count!.mockResolvedValue(3)
    db.notification.update!.mockResolvedValue({})
    db.notification.updateMany!.mockResolvedValue({ count: 1 })
    db.notificationPreference.findUnique!.mockResolvedValue(null)
    mockSendPush.mockResolvedValue('sent')
  })

  test('claims an attempt, sends the alert with badge and deep-link keys, then stamps pushedAt', async () => {
    await expect(deliverPush('reaction:p1:ann')).resolves.toBe('sent')

    expect(mockSendPush).toHaveBeenCalledWith('author', {
      aps: { alert: { title: 'New reaction', body: 'Ann reacted 🔥 to your post' }, badge: 3, sound: 'default' },
      notificationId: 'n1',
      type: 'POST_REACTION',
      target: { postId: 'p1' },
    })
    expect(db.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'n1', pushedAt: null, pushAttempts: 0 },
      data: { pushAttempts: { increment: 1 } },
    })
    expect(db.notification.updateMany!.mock.invocationCallOrder[0]!).toBeLessThan(mockSendPush.mock.invocationCallOrder[0]!)
    expect(db.notification.update).toHaveBeenCalledWith({ where: { id: 'n1' }, data: { pushedAt: expect.any(Date) } })
    expect(logger.info).toHaveBeenCalledWith(
      { notificationId: 'n1', type: 'POST_REACTION', outcome: 'sent' },
      'notification.push',
    )
  })

  // Regression (slice 3 review): two sweeps, or a sweep and the request's own
  // waitUntil, could both read pushedAt = null and both send.
  test('another delivery claimed this attempt first: nothing is sent', async () => {
    db.notification.updateMany!.mockResolvedValueOnce({ count: 0 })
    await expect(deliverPush('k')).resolves.toBe('skipped')
    expect(mockSendPush).not.toHaveBeenCalled()
  })

  test('no device also completes delivery: nothing to retry', async () => {
    mockSendPush.mockResolvedValueOnce('no_device')
    await deliverPush('k')
    expect(db.notification.update).toHaveBeenCalledWith({ where: { id: 'n1' }, data: { pushedAt: expect.any(Date) } })
  })

  test('a failed push keeps its claimed attempt but leaves pushedAt null for the sweep to retry', async () => {
    mockSendPush.mockResolvedValueOnce('failed')
    await expect(deliverPush('k')).resolves.toBe('failed')
    expect(db.notification.updateMany).toHaveBeenCalledTimes(1)
    expect(db.notification.update).not.toHaveBeenCalled()
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

  // Regression (slice 2 review): a reaction holds the (user, post) lock, not
  // the user-pair lock a block takes, so one can commit just as the author
  // blocks the reactor. The push must re-check rather than trust notify().
  test('a block that landed after the notification was written: no push, and the row is deleted', async () => {
    mockIsBlocked.mockResolvedValueOnce(true)

    await expect(deliverPush('k')).resolves.toBe('skipped')

    expect(mockIsBlocked).toHaveBeenCalledWith('ann', 'author')
    expect(db.notification.deleteMany).toHaveBeenCalledWith({ where: { id: 'n1' } })
    expect(mockSendPush).not.toHaveBeenCalled()
  })

  test('system notifications (no actor) skip the block re-check', async () => {
    db.notification.findUnique!.mockResolvedValueOnce({ ...row, actorId: null, actor: null })
    await deliverPush('k')
    expect(mockIsBlocked).not.toHaveBeenCalled()
    expect(mockSendPush).toHaveBeenCalled()
  })

  // Regression (slice 3 review): the sweep can read a session as IN_PROGRESS,
  // the user completes it, and the reminder is then written and pushed.
  describe('WORKOUT_UNFINISHED re-checks its session before pushing', () => {
    const unfinished = { ...row, type: 'WORKOUT_UNFINISHED', actorId: null, actor: null, postId: null, data: {} }

    test.each([
      ['program session completed', { ...unfinished, workoutSessionId: 's1', workoutSession: { status: 'COMPLETED' } }],
      ['program session deleted', { ...unfinished, workoutSessionId: null, workoutSession: null }],
      ['standalone session completed', { ...unfinished, standaloneSessionId: 's2', standaloneSession: { status: 'COMPLETED' } }],
    ])('%s: dismissed, not pushed', async (_label, found) => {
      db.notification.findUnique!.mockResolvedValueOnce(found)

      await expect(deliverPush('unfinished:s1')).resolves.toBe('skipped')

      expect(db.notification.update).toHaveBeenCalledWith({ where: { id: 'n1' }, data: { dismissedAt: expect.any(Date) } })
      expect(mockSendPush).not.toHaveBeenCalled()
    })

    test('still in progress: pushed', async () => {
      db.notification.findUnique!.mockResolvedValueOnce({ ...unfinished, workoutSessionId: 's1', workoutSession: { status: 'IN_PROGRESS' } })
      await expect(deliverPush('unfinished:s1')).resolves.toBe('sent')
    })
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

  test('accepts several keys, skipping nulls', () => {
    const waitUntil = vi.fn()
    pushAfterCommit({ waitUntil } as never, ['a', null, 'b'])
    expect(waitUntil).toHaveBeenCalledTimes(2)
  })

  test('does nothing when notify skipped the notification', () => {
    const waitUntil = vi.fn()
    pushAfterCommit({ waitUntil } as never, null)
    expect(waitUntil).not.toHaveBeenCalled()
    expect(db.notification.findUnique).not.toHaveBeenCalled()
  })
})

describe('notifySystem', () => {
  const tx = { notification: { createManyAndReturn: vi.fn() } }

  beforeEach(() => {
    vi.clearAllMocks()
    tx.notification.createManyAndReturn.mockImplementation(({ data }: { data: { dedupeKey: string }[] }) =>
      Promise.resolve(data.map(({ dedupeKey }) => ({ dedupeKey }))))
  })

  test('writes actor-less notifications in one insert, skipping duplicates; returns the keys created', async () => {
    const keys = await notifySystem(tx as never, [
      { recipientId: 'u1', type: 'WORKOUT_UNFINISHED', dedupeKey: 'unfinished:s1', target: { workoutSessionId: 's1' } },
      { recipientId: 'u2', type: 'WORKOUT_REMINDER', dedupeKey: 'reminder:sw1', target: { scheduledWorkoutId: 'sw1' }, data: { programName: 'Arm Farm', weekNumber: 1, dayNumber: 2 } },
    ])

    expect(keys).toEqual(['unfinished:s1', 'reminder:sw1'])
    expect(tx.notification.createManyAndReturn).toHaveBeenCalledWith({
      data: [
        { recipientId: 'u1', actorId: null, type: 'WORKOUT_UNFINISHED', dedupeKey: 'unfinished:s1', workoutSessionId: 's1', data: {} },
        { recipientId: 'u2', actorId: null, type: 'WORKOUT_REMINDER', dedupeKey: 'reminder:sw1', scheduledWorkoutId: 'sw1', data: { programName: 'Arm Farm', weekNumber: 1, dayNumber: 2 } },
      ],
      skipDuplicates: true,
      select: { dedupeKey: true },
    })
  })

  test('nothing to write: no insert', async () => {
    await expect(notifySystem(tx as never, [])).resolves.toEqual([])
    expect(tx.notification.createManyAndReturn).not.toHaveBeenCalled()
  })
})

describe('dismissUnfinishedReminder', () => {
  beforeEach(() => vi.clearAllMocks())

  test('dismisses only the caller\'s reminder for that session, once', () => {
    dismissUnfinishedReminder('me', 's1')
    expect(db.notification.updateMany).toHaveBeenCalledWith({
      where: { dedupeKey: 'unfinished:s1', recipientId: 'me', dismissedAt: null },
      data: { dismissedAt: expect.any(Date) },
    })
  })
})
