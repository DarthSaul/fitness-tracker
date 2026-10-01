# Spec: friendships-removal

Module of [CAPABILITY_MAP.md](CAPABILITY_MAP.md). This is the **contract** step
of the friends → follows pivot ([SPEC-follows.md](SPEC-follows.md)).

## Objective

Drop the schema objects that #135 left in place so production could roll out
safely:

- the `Friendship` table and its `FriendshipStatus` enum, and
- the `Post.visibility` column and its `PostVisibility` enum.

No code has read or written them since #135.

## Preconditions (checked 2026-09-30)

| Check | Result |
|---|---|
| #135 is the live production deployment | ✅ Vercel production `READY` at `8fff1a4` (#135) |
| No code references the objects | ✅ `git grep` finds only tests asserting legacy input is ignored or rejected |
| Data at risk | ✅ `Friendship`: 0 rows. `Post`: 0 rows (the column only ever held its default) |

## The migration — `20260930160000_drop_friendships`

1. **Safety guard:** `RAISE EXCEPTION` if `Friendship` has any rows, so a
   row written since the count aborts the migration instead of being lost.
2. Drop `Friendship`'s foreign keys, then the table.
3. Drop the `Post.visibility` column.
4. Drop the `FriendshipStatus` and `PostVisibility` enums.

The down path (recreating the empty objects) is written in the migration
header.

## Consequence to accept

Once applied, an **instant rollback of production to #134 or earlier fails**:
Vercel still lists those deployments as rollback candidates, and their code
reads the dropped objects. Rolling back to #135 or later is unaffected. With
7 users and no social data, the alternative of waiting a bake period buys
little, but the timing is a deliberate choice.

## Changes

- `prisma/schema.prisma`: remove the four objects and the two `User`
  relations.
- `server/utils/posts.ts` (+ test): drop the comment and test name that called
  the column deprecated.
- Docs: capability map status, the follows spec's migration section, the task
  list.

No API change.

## Success criteria

- [ ] `prisma validate` and `prisma generate` are clean; typecheck and the
      full suite pass.
- [ ] After apply: `migrate status` is up to date, there's no schema drift,
      and the four objects are gone (`pg_class` / `pg_type`).
- [ ] Production still serves social routes after apply (a 401 for
      unauthenticated requests on the live URL, no 500s).
