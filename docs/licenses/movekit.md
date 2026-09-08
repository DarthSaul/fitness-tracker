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
URLs (`Exercise.animationUrl`, `Exercise.posterUrl`).

The clips are hosted in the Supabase Storage bucket `exercise-media`, which is
**public** so the web and iOS clients can stream them directly. To honour
Section 3 without signed URLs, every object path carries a random token:

```
exercises/<slug>/<token>/demo.mp4
exercises/<slug>/<token>/poster.webp
```

`<token>` is 16 base64url characters minted from `crypto.randomBytes` once per
clip at upload time. A path cannot be guessed from the exercise slug, the
bucket root and the `exercises/<slug>/` prefixes are not listable without a
service key, and uploads never overwrite (a new version of a clip gets a new
token). The URLs are served only to authenticated users of the app through
the API.

**Clients must never expose a download, share, "open in browser" or copy-link
affordance for these URLs.** Play them inline, without native media controls
that offer a download, and treat the URL as an implementation detail.

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
  clip lives under. If it is lost, the current URLs can be recovered from
  `Exercise.animationUrl` / `posterUrl` in the database, or the clips can be
  re-uploaded under fresh tokens.
- [`media-manifest.private.example.json`](../../media-manifest.private.example.json)
  — committed, one placeholder entry documenting the private file's shape.

JSON cannot carry comments, so this section is the pointer that explains why
`media-manifest.json` looks incomplete on its own.

Pipeline: `pnpm media:normalize` → `pnpm media:upload` → `pnpm media:attach`.
