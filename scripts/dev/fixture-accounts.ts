// The local fixture accounts, shared by seed-social.ts and seed-workouts.ts.
// Each signs in with `<handle>@drdumbbell.test` and DEV_PASSWORD.

export const DEV_PASSWORD = 'password123'

export type Handle = 'me' | 'alice' | 'bob' | 'carol' | 'dave' | 'erin' | 'fresh'

export const ACCOUNTS: Record<Handle, { name: string, username: string, bio: string | null, visibility: 'PUBLIC' | 'PRIVATE' }> = {
  me: { name: 'Dev Me', username: 'dev_me', bio: 'The account you sign in as.', visibility: 'PRIVATE' },
  alice: { name: 'Alice Lifts', username: 'alice_lifts', bio: 'Public profile. You follow her.', visibility: 'PUBLIC' },
  bob: { name: 'Bob Benches', username: 'bob_benches', bio: 'Private. Your request to him is pending.', visibility: 'PRIVATE' },
  carol: { name: 'Carol Cardio', username: 'carol_cardio', bio: 'Public. Her request to you is pending.', visibility: 'PUBLIC' },
  dave: { name: 'Dave Deadlifts', username: 'dave_deadlifts', bio: 'Public. You have blocked him.', visibility: 'PUBLIC' },
  erin: { name: 'Erin Squats', username: 'erin_squats', bio: 'Private. You follow each other.', visibility: 'PRIVATE' },
  // Deliberately empty: no follows, posts, workouts, program or bio, for the
  // empty-state UIs. Both seeds reset it to empty.
  fresh: { name: 'Fresh Start', username: 'fresh_start', bio: null, visibility: 'PRIVATE' },
}

export const HANDLES = Object.keys(ACCOUNTS) as Handle[]

export const emailFor = (handle: Handle): string => `${handle}@drdumbbell.test`
