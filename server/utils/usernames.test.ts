import { describe, test, expect } from 'vitest'

import { normalizeUsername, usernameProblem, parseUsername, generateUsername, RESERVED_USERNAMES } from './usernames'

describe('normalizeUsername', () => {
  test.each([
    ['  SaulG ', 'saulg'],
    ['@SaulG', 'saulg'],
    ['@@saul', '@saul'], // only one leading @ is dropped; the rest fails validation
    ['saul.g_1', 'saul.g_1'],
  ])('%j → %j', (raw, expected) => {
    expect(normalizeUsername(raw)).toBe(expected)
  })
})

describe('usernameProblem', () => {
  test.each(['abc', 'saul.g', 'saul_g', 'a_b.c_d', '123', 'x'.repeat(30), 'user_000123'])('%j is valid', (name) => {
    expect(usernameProblem(name)).toBeNull()
  })

  test.each([
    ['too short', 'ab'],
    ['too long', 'x'.repeat(31)],
    ['uppercase (not normalized)', 'Saul'],
    ['a space', 'saul g'],
    ['a hyphen', 'saul-g'],
    ['an emoji', 'saul💪'],
    ['a non-ASCII letter', 'josé'],
    ['a leading period', '.saul'],
    ['a trailing period', 'saul.'],
    ['consecutive periods', 'sa..ul'],
    ['an @', '@saul'],
  ])('%s is invalid', (_label, name) => {
    expect(usernameProblem(name)).toBe('invalid')
  })

  test('reserved names are reported as reserved', () => {
    for (const name of ['admin', 'support', 'drdumbbell', 'dr.dumbbell', 'me']) {
      expect(RESERVED_USERNAMES.has(name)).toBe(true)
      expect(usernameProblem(name)).toBe(name.length < 3 ? 'invalid' : 'reserved')
    }
  })
})

describe('parseUsername', () => {
  test('normalizes, then validates', () => {
    expect(parseUsername(' @Saul.G ')).toBe('saul.g')
  })

  test.each([
    ['not a string', 7],
    ['missing', undefined],
    ['null', null],
    ['invalid', 'sa..ul'],
  ])('400 for %s', (_label, raw) => {
    expect(() => parseUsername(raw)).toThrow(expect.objectContaining({ statusCode: 400 }))
  })

  test('400 naming a reserved username', () => {
    expect(() => parseUsername('Admin')).toThrow(expect.objectContaining({ statusCode: 400, statusMessage: 'That username is reserved' }))
  })
})

describe('generateUsername', () => {
  test('is "user_" plus 6 digits, and always passes validation', () => {
    for (let i = 0; i < 200; i++) {
      const name = generateUsername()
      expect(name).toMatch(/^user_\d{6}$/)
      expect(usernameProblem(name)).toBeNull()
    }
  })

  test('draws different digits across calls', () => {
    expect(new Set(Array.from({ length: 50 }, generateUsername)).size).toBeGreaterThan(1)
  })
})
