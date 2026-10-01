# Spec: post-photos

Module of [CAPABILITY_MAP.md](CAPABILITY_MAP.md). Shared commands, structure,
style, testing and boundaries are defined there. Builds on `posts` and on
`friendships-removal` (#137), which both edit `Post`.

## Objective

A post can carry up to 4 photos. Photos are safe to share:

- **No location data:** EXIF, GPS and every other piece of metadata are
  removed server-side, before anything is stored.
- **Private storage:** photos live in a private bucket and are only reachable
  through short-lived signed URLs, under the same visibility rule as the post.

## Decisions (2026-09-30)

1. **Upload, then attach** (the standard `media_ids` pattern).
   `POST /api/post-photos` uploads one photo and returns an id. Then
   `POST /api/posts` `{ body?, photoIds }` attaches up to 4 of them.
2. **≤ 4 MB per upload; iOS downscales.** Vercel caps a function's request
   body at 4.5 MB (`413 FUNCTION_PAYLOAD_TOO_LARGE`), so the agreed "10 MB"
   default couldn't work. The app resizes to ~2048 px JPEG before uploading,
   and the full-resolution original never leaves the phone.
3. **Photos are fixed once posted.** `PATCH /api/posts/:id` still edits only
   `body`. Deleting the post deletes its photos.

## Processing — `server/utils/post-photos.ts`

Each upload is processed with `sharp` (the one new dependency, agreed at the
start of the initiative):

1. **Reject what isn't a supported image.**
   - Only `image/jpeg`, `image/png` and `image/webp` are accepted, checked by
     **decoding** the file rather than trusting the declared type. Anything
     else is `415`.
   - HEIC is `415` too: sharp's prebuilt binaries can't decode it, so iOS
     must send JPEG.
2. **Bound the work.** `limitInputPixels: 50_000_000` guards against
   decompression bombs: a tiny file that expands into a huge image.
3. **Fix orientation, then strip.** `.rotate()` applies the EXIF orientation
   to the pixels. Sharp then drops all metadata by default, and we never call
   `withMetadata()`.
4. **Normalize.**
   `.resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })`,
   then `.jpeg({ quality: 82, mozjpeg: true })`.
5. **Store** only the processed JPEG at `post-photos/<uploaderId>/<photoId>.jpg`,
   with its final width and height.

A unit test feeds a real JPEG carrying GPS EXIF through the pipeline and
asserts the output has none (`sharp(output).metadata()`).

## Data model

```prisma
model PostPhoto {
  id          String   @id @default(cuid())
  uploaderId  String
  postId      String?  // null until attached
  position    Int?     // 0–3 within the post, set on attach
  storagePath String   @unique
  width       Int
  height      Int
  createdAt   DateTime @default(now())

  uploader User  @relation(fields: [uploaderId], references: [id], onDelete: Cascade)
  post     Post? @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@unique([postId, position])
  @@index([uploaderId, postId])
}
```

The migration is additive (a new table). A raw `CHECK` keeps `postId` and
`position` both null or both set, with `position` between 0 and 3.

**Storage cleanup:** row cascades don't reach Supabase Storage, so each
removal deletes its objects too.

- **Deleting a post:** removes its objects best-effort, after the row is gone.
  A failure is logged as `post_photos.orphaned` and doesn't fail the request.
- **Account deletion** (`DELETE /api/auth/me`): removes all of the user's
  objects, the same way feedback screenshots are removed today.
- **Unattached uploads:** each `POST /api/post-photos` first deletes the
  caller's own unattached photos older than 24 h, the rows and the objects.
  There's no cron in the project. A user who uploads once and never returns
  leaves at most 4 small orphans; a scheduled sweep is a recorded follow-up.

## Routes

### `POST /api/post-photos` (multipart, field `photo`)

- **Size and format:**
  - over 4 MB → `413` (checked before decoding);
  - not a decodable JPEG, PNG or WebP → `415`;
  - missing file → `400`.
- **Rate limit:** `rateLimitByKey('post-photo:<userId>', 60, '1 h')`.
- **201:** `{ id, width, height }`. No URL: an unattached photo is only ever
  shown from the app's local copy.

### `POST /api/posts`, now `{ body?, photoIds? }`

- **Contents:**
  - `photoIds` holds 0–4 distinct ids. Their order is the display order.
  - `body` may be empty **only if** there is at least one photo; otherwise
    it's the existing 1–2,000 rule.
- **Each id must be the caller's own, unattached upload.** Anything else is
  `400` naming the bad id: someone else's, already attached, or unknown. There
  is no 404, because the ids come from the caller's own uploads.
- **Atomic:** the post is created and the photos attached in one transaction.
  The attach is guarded on `postId IS NULL`, so a race attaching the same
  photo to two posts can't succeed twice.

### `DELETE /api/posts/:id`

- Unchanged contract. It now also removes the post's storage objects,
  best-effort.

## Payload

`Post` gains:

```ts
photos: { id: string; url: string; width: number; height: number }[]  // in position order; [] for text-only
photosExpireAt: string | null  // when the signed URLs stop working; null if no photos
```

- **Signing:** every route returning posts (`GET /api/posts/:id`,
  `GET /api/users/:id/posts`, `GET /api/feed`, and create) signs **all
  photos on the page in one storage call**, with a 15-minute TTL like
  exercise media.
- **Visibility:** a photo is only ever signed for a viewer who passed the
  post's visibility rule. There's no separate photo-visibility logic.
- **Expiry:** clients re-fetch when `photosExpireAt` passes.

## Rollout

1. **Bucket:** create the private `post-photos` Storage bucket, with no
   public access and a 4 MB file size limit. This is a Supabase change, done
   with explicit go-ahead, like a migration.
2. **Migration:** apply it (additive).
3. **Preview check:** in a Vercel preview, upload a real phone JPEG carrying
   GPS and confirm the stored object has no EXIF. This catches sharp's native
   binary not working on Vercel, which is a known risk in `tasks/plan.md`.

## Out of scope

Video, HEIC on the server, editing photos after posting, captions per photo,
alt text (worth adding with the accessibility pass), a scheduled orphan sweep.

## Success criteria

- [ ] A JPEG with GPS EXIF uploads, and the stored file has **no** EXIF/GPS
      (unit test on real bytes, plus a preview-deploy check).
- [ ] A rotated phone photo is stored upright.
- [ ] Rejections: 5 MB → 413; a `.txt` renamed `.jpg` → 415; HEIC → 415;
      no file → 400.
- [ ] Post with 1–4 photos and no text works; 5 photos → 400; zero photos and
      empty text → 400.
- [ ] Attaching someone else's photo, or one already attached → 400; a
      concurrent double-attach can't succeed twice.
- [ ] Every post-returning route includes signed URLs in position order,
      signed in one storage call per response.
- [ ] A viewer who can't see the post can't obtain its photo URLs.
- [ ] Deleting a post or the account removes the storage objects.
- [ ] An upload sweeps the caller's own unattached photos older than 24 h.
