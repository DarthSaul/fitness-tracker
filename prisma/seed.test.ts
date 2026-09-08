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
  // Every writer of the Exercise catalog must derive `slug` from `name` on both
  // branches of the upsert: `create` is enforced by the Prisma types (the column
  // is required), but `update` is not, and a seed that skips it there would let
  // a renamed exercise keep a stale slug.
  const upsertBlocks = seedSource
    .split('prisma.exercise.upsert(')
    .slice(1)
    .map(block => block.slice(0, block.indexOf('});')))

  test('the three catalog writers are all present', () => {
    expect(upsertBlocks).toHaveLength(3)
  })

  test('every catalog upsert derives slug from name on create and update', () => {
    for (const block of upsertBlocks) {
      const occurrences = block.match(/slug: slugify\(name\)/g) ?? []
      expect(occurrences, `upsert block missing slug derivation:\n${block}`).toHaveLength(2)
    }
  })

  test('slugify is imported from the shared helper', () => {
    expect(seedSource).toMatch(/import \{ slugify \} from '\.\.\/shared\/utils\/slug'/)
  })
})
