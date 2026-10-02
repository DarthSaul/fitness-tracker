# Spec: usernames (and bio)

Module of [CAPABILITY_MAP.md](CAPABILITY_MAP.md). Shared commands, structure,
style, testing and boundaries are defined there. Extends `user-discovery`
(#132) and the profile settings in `follows` (#135).

## Objective

- **A username for every user,** alongside `name` (the display name) and
  `email`. It's unique, chosen by the user and changeable, and it's shown
  wherever a user appears. It lays the groundwork for shareable profile links
  later (`drdumbbell.app/@saulg`); the links themselves are out of scope.
- **An optional bio** of up to 100 characters on the profile.

Today `User` has `name`, `email` and `avatarUrl`. Nothing like a username or
bio exists.

## Decisions (approved 2026-10-02)

1. **Format.**
   - **Characters:** 3–30 of `a–z`, `0–9`, `_` and `.`.
   - **Periods:** no leading, trailing or consecutive `.`.
   - **Case:** stored lowercase. Input is trimmed, a leading `@` is dropped,
     and it's lowercased before validating, so `@SaulG` saves as `saulg`.
2. **Unique across all users,** enforced by a unique index on the stored
   lowercase value. A taken name is `409 'Username taken'`.
3. **Reserved names can't be claimed.** They're kept in code
   (`RESERVED_USERNAMES`), so future `/@name` links and support channels
   can't be impersonated:
   - `admin`, `administrator`, `support`, `help`, `api`, `app`, `www`,
     `root`, `system`, `moderator`, `mod`, `staff`, `official`, `security`;
   - `drdumbbell`, `dr.dumbbell`, `dr_dumbbell`, `dumbbell`;
   - `settings`, `login`, `signup`, `about`, `privacy`, `terms`, `home`,
     `feed`, `me`, `null`, `undefined`.

   Claiming one is `400`.
4. **Required for every account** (approved).
   - **New accounts** get a generated username when `findOrLinkUser` creates
     the user. That function is the only place users are created.
   - **Existing accounts** get one in a backfill migration. The generation
     scheme for both is `user_` plus 6 random digits (see "Generation
     scheme" below).
   - **Once the backfill is applied, and the code that generates usernames is
     deployed,** a later migration sets the column `NOT NULL`
     (expand/contract).
5. **Changeable at any time** through `PATCH /api/auth/me` `{ username }`.
   There's no cooldown yet; one should be added before shareable links ship,
   so a link can't be hijacked right after someone renames.
6. **Shown everywhere a user appears** (approved). `username` joins
   `PublicUser`, so it appears in:
   - feed and post authors,
   - search results,
   - follower, following and request lists,
   - who-reacted rows,
   - the blocked list.

   The field is additive, so existing clients ignore it.
7. **Search matches usernames** (approved).
   - **Matching:** `GET /api/users/search?q=` also matches usernames that
     **start with** `q`, with a leading `@` dropped. A name still matches
     anywhere in it.
   - **Email search is unchanged:** a `q` containing `@` after its first
     character still means an exact email match. So `@saul` searches
     usernames, while `saul@x.com` searches emails.
   - **Order:** an exact username match comes first, then the rest by name.
     The 20-result cap and the rate limit are unchanged.
8. **Availability check:** `GET /api/users/username-available?username=`
   returns `200 { available: boolean, reason?: 'invalid' | 'reserved' | 'taken' }`,
   so the app can validate as the user types.
   - **Rate limit:** 60 per minute per user. It's cheap, but it reveals which
     names exist, and usernames are public anyway.
   - **Your own name:** your current username counts as available to you.
9. **Bio.**
   - **Shape:** optional, trimmed, at most **100 Unicode code points** (what `char_length` counts; a combined emoji counts all of its code points). Blank is
     stored as null.
   - **Setting it:** `PATCH /api/auth/me` `{ bio }`, where `null` or `""`
     clears it.
   - **Where it appears:** on the **profile only**: `GET /api/users/:id`
     and `GET /api/auth/me`. It's not in `PublicUser`, so lists stay light.
   - **Who sees it:** anyone who can see the profile, like `name`. Profile
     visibility gates only posts.

## Data model

```prisma
model User {
  // …existing fields…
  /// Unique handle, stored lowercase (docs/social/SPEC-usernames.md). Nullable
  /// only until the backfill; then NOT NULL (contract step).
  username String? @unique
  /// Optional profile bio, at most 100 characters.
  bio      String?
}
```

**Migration 1, additive, in this PR:**
- the two nullable columns and the unique index;
- `CHECK` the username format at the database level: `^[a-z0-9_.]{3,30}$`,
  and none of `^\.`, `\.$` or `\.\.`;
- `CHECK (char_length(bio) <= 100)`.

**Migration 2, the backfill:** in this PR, applied before merge. See
"Generation scheme" below.

**Migration 3, `SET NOT NULL`:** its own deploy, once migration 2 is applied
and this PR's creation-time generation is live.

## Routes

- **`PATCH /api/auth/me`** accepts `username` and `bio`, alongside the existing
  `ptRoutineInWorkout` and `profileVisibility`. Any one of them is enough.
  - **Errors:** `400` for an invalid or reserved username, or a bio over 100
    characters. `409` when the username is taken, including a race (P2002).
  - **No-op:** setting your own current username again changes nothing.
- **`GET /api/auth/me`** returns `username` and `bio`.
- **`GET /api/users/:id`** returns `username` (via `PublicUser`) and `bio`.
- **`GET /api/users/search`** matches usernames, as in decision 7.
- **`GET /api/users/username-available`** is new; see decision 8.
- **Every route returning `PublicUser`** gains `username: string | null`. It's
  null only until the backfill.

## Generation scheme (decided 2026-10-02)

- **Format:** `user_` followed by **6 random digits**, for example `user_482193`.
  Nothing is derived from the name or email, so a generated username reveals
  nothing personal.
- **Collisions:** a taken candidate is retried with new digits. There are
  10⁶ possible names, which is plenty at today's scale. If it ever gets
  crowded, the digit count can grow without changing the format rules.
- **Users aren't notified.** They see the username in their profile and can
  change it whenever they like.
- **At sign-up:** `findOrLinkUser` generates a username when it creates a
  user. A P2002 on `username` regenerates and retries, up to 5 times. That
  stays separate from the existing P2002 path for concurrent first logins,
  which is keyed on the identity.
- **The backfill (migration 2, in this PR):** a SQL `DO` block gives every
  user with a null username a candidate, oldest first. It retries on
  `unique_violation` and is idempotent (`WHERE username IS NULL`).
- **Migration 3 (`SET NOT NULL`), its own later PR:** it re-runs the same
  backfill first, which covers anyone who signed up between the backfill and
  this PR's deploy, then sets the column `NOT NULL`.

## Out of scope

- Shareable `/@username` links, and looking a user up by username. The URL
  scheme comes later.
- A rename cooldown, and username history or redirects.
- Bios in lists, rich text, or links in bios.

## Files

- `prisma/schema.prisma` + migration 1; `vitest.setup.ts` (the real helpers)
- `server/utils/usernames.ts` (+ test): `normalizeUsername`, `parseUsername`
  (format and reserved names), `RESERVED_USERNAMES` and `generateUsername`
- `server/utils/auth.ts` (+ test): `findOrLinkUser` generates a username on
  create, retrying on a collision
- `server/utils/public-user.ts`: `username` in `publicUserSelect`; the
  affected fixtures across the social tests
- `server/api/auth/me.{get,patch}.ts` (+ tests)
- `server/api/users/search.get.ts`, `[id].get.ts` (+ tests)
- `server/api/users/username-available.get.ts` (+ test)
- `docs/API_CONTRACT_SOCIAL.md`, `CAPABILITY_MAP.md`, `tasks/todo.md`

## Success criteria

- [ ] `PATCH /api/auth/me` `{ username: '@SaulG' }` stores `saulg`. A taken
      name is `409`, even under a race. A reserved or invalid name is `400`.
- [ ] Every format rule holds at the API and in the database `CHECK`:
      length, characters, and leading, trailing or doubled periods.
- [ ] Every route that returns users includes `username`.
- [ ] Search with `q=sau` finds `saulg`, and an exact username match comes
      first. `@sau` behaves the same. Email search is unchanged.
- [ ] A username-availability check reports `invalid`, `reserved` or `taken`,
      and your own current name counts as available.
- [ ] A new sign-up gets a valid, unique generated username, even if two
      accounts are created at once.
- [ ] A bio of up to 100 characters saves, a blank one clears it, and 101
      characters is `400`. The bio shows only on the profile and `/me`.
