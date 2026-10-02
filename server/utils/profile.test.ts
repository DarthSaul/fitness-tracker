import { describe, test, expect } from 'vitest'

import { parseBio, meSelect, BIO_MAX } from './profile'

describe('parseBio', () => {
  test('trims', () => {
    expect(parseBio('  Lifting since 2010  ')).toBe('Lifting since 2010')
  })

  test.each([['null', null], ['empty', ''], ['whitespace', '   ']])('%s clears the bio', (_label, raw) => {
    expect(parseBio(raw)).toBeNull()
  })

  test('counts characters (code points), as the database CHECK does', () => {
    expect(parseBio('💪'.repeat(BIO_MAX))).toBe('💪'.repeat(BIO_MAX))
    expect(() => parseBio('💪'.repeat(BIO_MAX + 1))).toThrow(expect.objectContaining({ statusCode: 400 }))
  })

  test('a combined emoji counts as all its code points, as documented in the contract', () => {
    const family = '👨‍👩‍👧' // 5 code points: 3 people + 2 ZWJs
    expect([...family]).toHaveLength(5)
    expect(parseBio(family.repeat(20))).toBe(family.repeat(20)) // 100
    expect(() => parseBio(family.repeat(20) + '!')).toThrow(expect.objectContaining({ statusCode: 400 })) // 101
    expect([...'🇬🇧']).toHaveLength(2)
    expect([...'👍🏽']).toHaveLength(2)
  })

  test('the limit applies after trimming', () => {
    expect(parseBio(` ${'x'.repeat(BIO_MAX)} `)).toBe('x'.repeat(BIO_MAX))
  })

  test.each([['over the limit', 'x'.repeat(BIO_MAX + 1)], ['a number', 5], ['an object', {}]])('400 for %s', (_label, raw) => {
    expect(() => parseBio(raw)).toThrow(expect.objectContaining({ statusCode: 400 }))
  })
})

test('meSelect is the caller\'s own profile, including email, username and bio', () => {
  expect(meSelect).toEqual({
    id: true, email: true, name: true, avatarUrl: true, ptRoutineInWorkout: true, profileVisibility: true, username: true, bio: true,
  })
})
