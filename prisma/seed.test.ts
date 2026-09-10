import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const seedSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'seed.ts'), 'utf-8')

const FORBIDDEN_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: 'BB prefix (use "Barbell" instead)', pattern: /'BB\s/g },
  { label: 'Chin Up (Weighted) (use "Chin Up" instead)', pattern: /Chin Up \(Weighted\)/g },
  { label: '2-Arm Chest Supported DB Rows (use "Chest Supported 2-Arm DB Rows" instead)', pattern: /'2-Arm Chest Supported DB Rows'/g },
  { label: 'Band or Cable Pushdowns (use "Cable or Band Pushdowns" instead)', pattern: /Band or Cable Pushdowns/g },
]

describe('seed.ts exercise name conventions', () => {
  for (const { label, pattern } of FORBIDDEN_PATTERNS) {
    test(`no legacy name: ${label}`, () => {
      const matches = seedSource.match(pattern)
      expect(matches, `Found forbidden pattern in seed.ts: ${label}`).toBeNull()
    })
  }
})

describe('seed.ts exercise slugs', () => {
  // Slugs are write-once: exercise-media storage paths and deep links are filed
  // under them. Every writer of the Exercise catalog must derive `slug`
  // from `name` on the `create` branch of its upsert and must never touch it on
  // `update`, so a renamed exercise keeps the slug its media is filed under.
  const upsertBlocks = seedSource
    .split('prisma.exercise.upsert(')
    .slice(1)
    .map(block => block.slice(0, block.indexOf('});')))

  test('the three catalog writers are all present', () => {
    expect(upsertBlocks).toHaveLength(3)
  })

  test('every catalog upsert derives slug from name on create only', () => {
    for (const block of upsertBlocks) {
      const updateStart = block.indexOf('update:')
      const createStart = block.indexOf('create:')
      expect(updateStart, `upsert block has no update branch:\n${block}`).toBeGreaterThan(-1)
      expect(createStart, `upsert block has no create branch:\n${block}`).toBeGreaterThan(updateStart)
      const updateBranch = block.slice(updateStart, createStart)
      const createBranch = block.slice(createStart)
      expect(createBranch, `create branch missing slug derivation:\n${block}`).toMatch(/slug: slugify\(name\)/)
      expect(updateBranch, `update branch must not regenerate slug:\n${block}`).not.toMatch(/slug/)
    }
  })

  test('slugify is imported from the shared helper', () => {
    expect(seedSource).toMatch(/import \{ slugify \} from '\.\.\/shared\/utils\/slug'/)
  })
})
