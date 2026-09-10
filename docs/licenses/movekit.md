# MoveKit exercise animations

[MoveKit](https://movekit.com) sells 3D-rendered exercise demonstration clips
(a grey anatomical figure performing one movement, with the working muscles
highlighted) for use in fitness apps and coaching products. DR. DUMBBELL uses
them as the exercise preview shown from a workout, so a lifter never has to
leave the app to check a movement.

## License

Purchased 2026-09-08 under the **MoveKit License Agreement v1.0**
(effective 4 August 2026, <https://movekit.com/license>). The purchase
certificate, which carries the license ID, order details and licensee contact
information, is kept outside this repository and is deliberately not
committed.

Summary of the terms we rely on:

- Non-exclusive, worldwide, **perpetual** license to one entity, covering
  unlimited projects, including mobile and web apps and commercial products.
- **Modifying and editing** clips for our own use cases is permitted. Our
  re-encode (720×720 centre crop, CRF 27, no audio) and the poster stills we
  derive from it are covered by this.
- **No attribution or credit requirement.**
- Prohibited: reselling, redistributing, sublicensing, or offering the files
  as a competing library, asset pack, dataset or stock offering; using the
  content as AI training data or for AI restyling; removing license
  identifiers or metadata.
- Delivery to end users (Section 3, quoted verbatim): *"The Licensee may
  display and stream the Content to end users of the Licensee's products and
  services. The Licensee may not provide end users with the ability to
  download, extract, or otherwise obtain the raw Content files, and may not
  expose raw file URLs or download links publicly or to unauthorized parties."*

## Where the files live

**The media files are never committed to this repository.** It is public,
and the license does not permit redistribution. Everything under `media/`
(the raw purchase copies and the normalized outputs) is gitignored, and the
MoveKit purchase folder itself stays outside the repo. Postgres stores only
bucket-relative object keys (`Exercise.animationPath`, `Exercise.posterPath`),
never URLs.

The clips are hosted in the Supabase Storage bucket `exercise-media`, which is
**private**: nothing in it is reachable without a signature. This is how we
meet both halves of Section 3 — "display and stream" without letting anyone
"obtain the raw Content files" or hold a working link:

- `GET /api/exercises/:id/info` (authenticated) signs the two keys on every
  read and returns them as `animationUrl` / `posterUrl`, valid for
  **15 minutes** (`mediaExpiresAt`). See `server/utils/exercise-media.ts`.
- A forwarded or captured URL is dead within minutes; the client simply
  re-requests the route when the expiry passes.
- Keys follow `exercises/<slug>/<token>/{demo.mp4,poster.webp}`, where
  `<token>` is 16 base64url characters from `crypto.randomBytes`, minted once
  per clip at upload. On a private bucket the token is defence in depth only;
  it keeps keys unguessable even if a listing ever leaked. Uploads never
  overwrite: a new version of a clip is a new token.
- The upload script converges the bucket to private if it ever finds it
  public.

**Clients must never expose a download, share, "open in browser" or copy-link
affordance for these URLs.** Play them inline, without native media controls
that offer a download, and treat the URL as an implementation detail that
expires.

History: the first upload (2026-09-08) used a public bucket with the random
tokens as the only guard. Review correctly pointed out that a public object
URL, once handed to a user, works for anyone forever, which is the "obtain"
half of Section 3. The switch to a private bucket and signed URLs landed on
2026-09-10 in the same PR.

## Per-clip ledger and storage index

Two files at the repo root describe the media. They are split so that the
tokens, which are the only thing keeping the URLs unguessable, never reach
this public repository.

- [`media-manifest.json`](../../media-manifest.json) — **committed.** The
  purchase ledger: our `Exercise.slug` and `exerciseId`, the source
  (`movekit`), MoveKit's exercise name, and the purchase date. Add an entry
  here for every new clip. It carries no paths or tokens.
- `media-manifest.private.json` — **gitignored, never commit it.** The storage
  index: one entry per slug with the token and the two storage paths.
  `scripts/media/upload.ts` writes it; `scripts/media/attach.ts` reads it.
  **Back this file up together with the raw source files** (the MoveKit
  purchase folder), since it is the only local record of which token each
  clip lives under. If it is lost, the current keys can be recovered from
  `Exercise.animationPath` / `posterPath` in the database, or the clips can
  be re-uploaded under fresh tokens.
- [`media-manifest.private.example.json`](../../media-manifest.private.example.json)
  — committed, one placeholder entry documenting the private file's shape.

JSON cannot carry comments, so this section is the pointer that explains why
`media-manifest.json` looks incomplete on its own.

Pipeline: `pnpm media:normalize` → `pnpm media:upload` → `pnpm media:attach`.
