// Seeds a fixed social graph into the LOCAL Supabase stack, so the iOS app and
// the web client have follows, posts, reactions, a block and an inbox to test
// against. Every account signs in with email + DEV_PASSWORD.
//
//   pnpm db:local:seed-social      (see docs/LOCAL_DEV.md)
//
// Re-runnable: accounts are upserted, and every follow, post, reaction, block
// and notification touching a fixture account is deleted and recreated, so a
// run always returns the graph below. Workouts and programs are left alone.
//
// Writes go straight through Prisma, so no push is sent; the notification rows
// are written by hand in the same shape the API writes them
// (server/utils/notifications.ts `notificationKeys`).

import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { assertLocalTarget } from './local-guard'
import { ACCOUNTS, DEV_PASSWORD, HANDLES, emailFor, type Handle } from './fixture-accounts'

assertLocalTarget(process.env)

const prisma = new PrismaClient()
const supabase = createClient(process.env.NUXT_SUPABASE_URL!, process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** Finds or creates the confirmed Supabase Auth user; returns its id. */
async function ensureAuthUser(email: string, name: string): Promise<string> {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const found = data.users.find((u) => u.email === email)
    if (found) {
      // Keep the documented password even if someone changed it locally.
      const { error: updateError } = await supabase.auth.admin.updateUserById(found.id, { password: DEV_PASSWORD })
      if (updateError) throw updateError
      return found.id
    }
    if (data.users.length < 1000) break
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: { name },
  })
  if (error) throw error
  return data.user.id
}

/** Upserts the User row and its `email` Identity, as a first sign-in would. */
async function ensureAccount(handle: Handle): Promise<string> {
  const { name, username, bio, visibility } = ACCOUNTS[handle]
  const email = emailFor(handle)
  const authId = await ensureAuthUser(email, name)

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, username, bio, profileVisibility: visibility },
    update: { name, username, bio, profileVisibility: visibility },
  })

  // A `supabase db reset` mints new auth ids; drop a stale email identity.
  await prisma.identity.deleteMany({ where: { userId: user.id, provider: 'email', providerId: { not: authId } } })
  await prisma.identity.upsert({
    where: { provider_providerId: { provider: 'email', providerId: authId } },
    create: { userId: user.id, provider: 'email', providerId: authId },
    update: { userId: user.id },
  })
  return user.id
}

async function main(): Promise<void> {
  const ids = {} as Record<Handle, string>
  for (const handle of HANDLES) {
    ids[handle] = await ensureAccount(handle)
  }
  const all = Object.values(ids)

  // Reset the social graph around the fixture accounts. Posts cascade to their
  // photos, reactions and notifications.
  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { OR: [{ recipientId: { in: all } }, { actorId: { in: all } }] } }),
    prisma.postReaction.deleteMany({ where: { userId: { in: all } } }),
    prisma.post.deleteMany({ where: { authorId: { in: all } } }),
    prisma.follow.deleteMany({ where: { OR: [{ followerId: { in: all } }, { followeeId: { in: all } }] } }),
    prisma.userBlock.deleteMany({ where: { OR: [{ blockerId: { in: all } }, { blockedId: { in: all } }] } }),
  ])

  const follow = (from: Handle, to: Handle, status: 'ACCEPTED' | 'PENDING') =>
    prisma.follow.create({
      data: { followerId: ids[from], followeeId: ids[to], status, acceptedAt: status === 'ACCEPTED' ? new Date() : null },
    })

  await follow('me', 'alice', 'ACCEPTED')
  await follow('me', 'bob', 'PENDING')
  const carolToMe = await follow('carol', 'me', 'PENDING')
  const meToErin = await follow('me', 'erin', 'ACCEPTED')
  await follow('erin', 'me', 'ACCEPTED')
  await follow('alice', 'carol', 'ACCEPTED')
  await follow('bob', 'alice', 'ACCEPTED')
  await prisma.userBlock.create({ data: { blockerId: ids.me, blockedId: ids.dave } })

  // Spread createdAt so the feed has a stable, believable order.
  let minutesAgo = 0
  const post = (author: Handle, body: string, sharedProgramName?: string) => {
    minutesAgo += 47
    return prisma.post.create({
      data: {
        authorId: ids[author],
        body,
        createdAt: new Date(Date.now() - minutesAgo * 60_000),
        ...(sharedProgramName && { sharedWorkoutKind: 'PROGRAM' as const, sharedProgramName }),
      },
    })
  }

  const myPost = await post('me', 'Week 2 of Brick House done. Legs are filing a complaint.', 'Brick House')
  const alicePost = await post('alice', 'New deadlift PR this morning!')
  await post('erin', 'Only visible to followers: you follow Erin, so you see this.')
  await post('carol', 'Public post from Carol.')
  await post('bob', 'Private post. Hidden from you until Bob accepts your request.')
  await post('dave', 'Hidden from you by the block.')
  await post('alice', 'Rest day. Mobility and a long walk.')
  await post('me', 'A plain text post with no reactions yet.')

  const react = (handle: Handle, postId: string, emoji: string) =>
    prisma.postReaction.create({ data: { postId, userId: ids[handle], emoji } })

  await react('alice', myPost.id, '🔥')
  await react('erin', myPost.id, '💪')
  await react('erin', myPost.id, '🔥')
  await react('me', alicePost.id, '❤️')
  await react('carol', alicePost.id, '👏')

  // Your inbox: what the API would have written for the rows above.
  await prisma.notification.createMany({
    data: [
      {
        recipientId: ids.me, actorId: ids.carol, type: 'FOLLOW_REQUEST',
        dedupeKey: `follow_request:${ids.carol}:${ids.me}`, followId: carolToMe.id,
      },
      {
        recipientId: ids.me, actorId: ids.alice, type: 'POST_REACTION',
        dedupeKey: `reaction:${myPost.id}:${ids.alice}`, postId: myPost.id, data: { emoji: '🔥' },
      },
      {
        recipientId: ids.me, actorId: ids.erin, type: 'POST_REACTION',
        dedupeKey: `reaction:${myPost.id}:${ids.erin}`, postId: myPost.id, data: { emoji: '💪' },
      },
      {
        recipientId: ids.me, actorId: ids.erin, type: 'FOLLOW_ACCEPTED',
        dedupeKey: `follow_accepted:${meToErin.id}`, readAt: new Date(),
      },
    ],
  })

  console.log('Social fixtures ready. Sign in with any of these (password: %s):', DEV_PASSWORD)
  for (const handle of HANDLES) {
    console.log(`  ${emailFor(handle).padEnd(26)} @${ACCOUNTS[handle].username.padEnd(16)} ${ACCOUNTS[handle].bio ?? '(empty: no follows, posts or workouts)'}`)
  }
}

main()
  .catch((error) => {
    console.error('Social seed failed:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
