import { describe, it, expect } from 'vitest'
import { slugify } from './slug'

describe('slugify', () => {
  it('lowercases and hyphenates a plain name', () => {
    expect(slugify('Bench Press')).toBe('bench-press')
  })

  it('handles the real catalog names that carry punctuation', () => {
    expect(slugify('1-Arm DB Row')).toBe('1-arm-db-row')
    expect(slugify('Alt. DB Curls')).toBe('alt-db-curls')
    expect(slugify('Chest Supported 2-Arm DB Rows')).toBe('chest-supported-2-arm-db-rows')
    expect(slugify('EZ Bar or Straight Bar Skullcrushers')).toBe('ez-bar-or-straight-bar-skullcrushers')
  })

  it('collapses runs of separators into a single hyphen', () => {
    expect(slugify('Cable  /  Band   Pushdowns')).toBe('cable-band-pushdowns')
  })

  it('trims leading and trailing separators', () => {
    expect(slugify('  --Plank-- ')).toBe('plank')
  })

  it('drops apostrophes instead of hyphenating them', () => {
    expect(slugify("Farmer's Walk")).toBe('farmers-walk')
    expect(slugify('Farmer’s Walk')).toBe('farmers-walk')
  })

  it('is idempotent', () => {
    expect(slugify(slugify('DB Zottman Curls'))).toBe('db-zottman-curls')
  })

  it('throws when nothing slug-worthy remains', () => {
    expect(() => slugify('!!!')).toThrow(/slug/i)
    expect(() => slugify('   ')).toThrow(/slug/i)
  })
})
