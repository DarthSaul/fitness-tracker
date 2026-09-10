/**
 * Attach uploaded exercise media to the `Exercise` catalog.
 *
 * Joins the committed ledger (`media-manifest.json`) with the gitignored
 * storage index (`media-manifest.private.json`, written by upload.ts) on
 * `slug`, and writes the index's bucket-relative object keys onto the
 * Exercise matched by `slug` as `animationPath` / `posterPath`. Rows never
 * hold URLs: the bucket is private and `GET /api/exercises/:id/info` signs
 * the keys for 15 minutes on every read (server/utils/exercise-media.ts).
 * `videoUrl` (the YouTube link) is never touched.
 *
 * Idempotent: rows already carrying the index's keys are reported as
 * unchanged, so it is safe to re-run every time the ledger grows. The ledger's
 * `exerciseId` must agree with the row found by slug — a mismatch means the
 * ledger drifted from the catalog and is reported as an error rather than
 * silently re-pointing media at a different exercise.
 *
 * Usage: pnpm media:attach      (= tsx --env-file=.env scripts/media/attach.ts)
 */
import { PrismaClient } from '@prisma/client'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const LEDGER_PATH = path.resolve('media-manifest.json')
const INDEX_PATH = path.resolve('media-manifest.private.json')

interface LedgerEntry {
  slug: string
  exerciseId: string
}

interface StorageEntry {
  slug: string
  token: string
  animation: string
  poster: string
}

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

/** Object keys are bucket-relative and must never arrive as URLs. */
function assertKey(slug: string, field: string, value: string): void {
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) {
    throw new Error(`${slug}: ${field} must be a bucket-relative object key, got ${value}`)
  }
}

const prisma = new PrismaClient()

async function main(): Promise<void> {
  const ledger = await readJson<LedgerEntry[]>(LEDGER_PATH)
  const index = await readJson<StorageEntry[]>(INDEX_PATH, [])

  let updated = 0
  let unchanged = 0
  let pending = 0
  const errors: string[] = []

  for (const entry of ledger) {
    const stored = index.find(s => s.slug === entry.slug)
    if (!stored) {
      console.log(`pending   ${entry.slug} — not in ${path.basename(INDEX_PATH)}, run \`pnpm media:upload\``)
      pending++
      continue
    }
    assertKey(entry.slug, 'animation', stored.animation)
    assertKey(entry.slug, 'poster', stored.poster)

    const exercise = await prisma.exercise.findUnique({
      where: { slug: entry.slug },
      select: { id: true, name: true, animationPath: true, posterPath: true },
    })
    if (!exercise) {
      errors.push(`${entry.slug}: no Exercise with that slug`)
      continue
    }
    if (exercise.id !== entry.exerciseId) {
      errors.push(`${entry.slug}: ledger exerciseId ${entry.exerciseId} but catalog row is ${exercise.id}`)
      continue
    }

    if (exercise.animationPath === stored.animation && exercise.posterPath === stored.poster) {
      console.log(`unchanged ${entry.slug}`)
      unchanged++
      continue
    }

    await prisma.exercise.update({
      where: { id: exercise.id },
      data: { animationPath: stored.animation, posterPath: stored.poster },
    })
    console.log(`updated   ${entry.slug} (${exercise.name})`)
    updated++
  }

  console.log(`\n${updated} updated, ${unchanged} unchanged, ${pending} pending, ${errors.length} errors`)
  for (const message of errors) console.error(`  error: ${message}`)
  if (errors.length) process.exitCode = 1
}

main()
  .catch((error: unknown) => {
    console.error('media:attach failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
