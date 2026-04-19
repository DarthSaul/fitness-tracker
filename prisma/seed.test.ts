import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const seedSource = readFileSync(resolve(__dirname, 'seed.ts'), 'utf-8')

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
