/**
 * Upload normalized exercise media to the public `exercise-media` bucket.
 *
 * Two manifests drive this (see docs/licenses/movekit.md):
 *
 *   media-manifest.json          committed purchase ledger — slug, exerciseId,
 *                                source, sourceName, purchasedAt
 *   media-manifest.private.json  gitignored storage index — slug, token and the
 *                                two storage paths. Never commit it: it is the
 *                                list of otherwise-unguessable URLs.
 *
 * For every ledger entry with no private entry yet it mints a token (16
 * base64url chars from crypto.randomBytes), uploads `media/out/<slug>/demo.mp4`
 * and `poster.webp` to `exercises/<slug>/<token>/…`, and appends the result to
 * the private index. Entries already in the index are skipped — uploads never
 * overwrite (`upsert: false`); a new version of a clip is a new token, so old
 * URLs keep working until retired.
 *
 * The bucket is public because the app streams these clips straight from
 * storage; the random token keeps each object path unguessable so the bucket
 * cannot be walked slug-by-slug.
 *
 * Requires the service role key: storage writes are gated by RLS and the app
 * has no anon-key client. Never expose this key to the browser.
 *
 * Usage: pnpm media:upload      (= tsx --env-file=.env scripts/media/upload.ts)
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { readFile, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'

const BUCKET = 'exercise-media'
const LEDGER_PATH = path.resolve('media-manifest.json')
const INDEX_PATH = path.resolve('media-manifest.private.json')
const OUT_DIR = path.resolve('media/out')
const ONE_YEAR_SECONDS = '31536000'

interface LedgerEntry {
  slug: string
  exerciseId: string
  source: string
  sourceName: string
  purchasedAt: string
}

interface StorageEntry {
  slug: string
  token: string
  animation: string
  poster: string
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name} — run via \`pnpm media:upload\` so .env is loaded`)
  return value
}

const supabaseUrl = requireEnv('NUXT_SUPABASE_URL')
const serviceRoleKey = requireEnv('NUXT_SUPABASE_SERVICE_ROLE_KEY')
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function readJson<T>(filePath: string, fallbackIfMissing?: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && fallbackIfMissing !== undefined) {
      return fallbackIfMissing
    }
    throw error
  }
}

/** 12 random bytes → exactly 16 base64url characters, no padding. */
function mintToken(): string {
  return randomBytes(12).toString('base64url')
}

async function ensureBucket(): Promise<void> {
  const { data: buckets, error } = await supabase.storage.listBuckets()
  if (error) throw new Error(`listBuckets: ${error.message}`)
  if (buckets.some(b => b.name === BUCKET)) {
    console.log(`bucket "${BUCKET}" already exists`)
    return
  }
  const { error: createError } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ['video/mp4', 'image/webp'],
    fileSizeLimit: 20 * 1024 * 1024,
  })
  if (createError) throw new Error(`createBucket ${BUCKET}: ${createError.message}`)
  console.log(`created public bucket "${BUCKET}"`)
}

async function assertFile(filePath: string): Promise<void> {
  try {
    const info = await stat(filePath)
    if (!info.isFile() || info.size === 0) throw new Error('empty')
  } catch {
    throw new Error(`missing or empty: ${path.relative(process.cwd(), filePath)} — run \`pnpm media:normalize\` first`)
  }
}

async function uploadFile(localPath: string, remotePath: string, contentType: string): Promise<string> {
  const body = await readFile(localPath)
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(remotePath, body, { cacheControl: ONE_YEAR_SECONDS, contentType, upsert: false })
  if (error) throw new Error(`upload ${remotePath}: ${error.message}`)
  return supabase.storage.from(BUCKET).getPublicUrl(remotePath).data.publicUrl
}

async function main(): Promise<void> {
  const ledger = await readJson<LedgerEntry[]>(LEDGER_PATH)
  const index = await readJson<StorageEntry[]>(INDEX_PATH, [])

  const orphan = index.find(entry => !ledger.some(l => l.slug === entry.slug))
  if (orphan) {
    throw new Error(`${path.basename(INDEX_PATH)} has "${orphan.slug}" but ${path.basename(LEDGER_PATH)} does not — add the ledger entry first`)
  }

  await ensureBucket()

  let uploaded = 0
  let skipped = 0
  for (const entry of ledger) {
    const existing = index.find(s => s.slug === entry.slug)
    if (existing) {
      console.log(`skip   ${entry.slug} — already uploaded under token ${existing.token}`)
      skipped++
      continue
    }

    const demoLocal = path.join(OUT_DIR, entry.slug, 'demo.mp4')
    const posterLocal = path.join(OUT_DIR, entry.slug, 'poster.webp')
    await assertFile(demoLocal)
    await assertFile(posterLocal)

    const token = mintToken()
    const animation = `exercises/${entry.slug}/${token}/demo.mp4`
    const poster = `exercises/${entry.slug}/${token}/poster.webp`

    const demoUrl = await uploadFile(demoLocal, animation, 'video/mp4')
    const posterUrl = await uploadFile(posterLocal, poster, 'image/webp')

    index.push({ slug: entry.slug, token, animation, poster })
    // Persist after each clip so a failure part-way leaves every completed
    // upload recorded in the index.
    await writeFile(INDEX_PATH, JSON.stringify(index, null, 2) + '\n')

    console.log(`upload ${entry.slug}`)
    console.log(`         ${demoUrl}`)
    console.log(`         ${posterUrl}`)
    uploaded++
  }

  console.log(`\n${uploaded} uploaded, ${skipped} skipped, index written to ${path.relative(process.cwd(), INDEX_PATH)}`)
}

main().catch((error: unknown) => {
  console.error('media:upload failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
