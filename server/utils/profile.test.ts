import { describe, test, expect } from 'vitest'

import { parseBio, meSelect, BIO_MAX, parseWeeklyWorkoutGoal, parseWeekStartDay, WEEKLY_GOAL_MAX } from './profile'
import { publicUserSelect } from './public-user'

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
    showActiveProgram: true, showWorkoutCount: true,
    weeklyWorkoutGoalEnabled: true, weeklyWorkoutGoal: true, weekStartDay: true,
  })
})

describe('parseWeeklyWorkoutGoal', () => {
  test.each([1, 4, WEEKLY_GOAL_MAX])('accepts %d', (goal) => {
    expect(parseWeeklyWorkoutGoal(goal)).toBe(goal)
  })

  test.each([
    ['null', null], ['zero', 0], ['eight', 8], ['a fraction', 4.5], ['a numeric string', '4'], ['NaN', Number.NaN], ['undefined', undefined],
  ])('400 for %s', (_label, raw) => {
    expect(() => parseWeeklyWorkoutGoal(raw)).toThrow(expect.objectContaining({ statusCode: 400 }))
  })
})

describe('parseWeekStartDay', () => {
  test.each(['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'])('accepts %s', (day) => {
    expect(parseWeekStartDay(day)).toBe(day)
  })

  test.each([['lowercase', 'monday'], ['unknown', 'FUNDAY'], ['a number', 1], ['null', null]])('400 for %s', (_label, raw) => {
    expect(() => parseWeekStartDay(raw)).toThrow(expect.objectContaining({ statusCode: 400 }))
  })
})

test('the weekly goal settings are private: none is in publicUserSelect', () => {
  for (const field of ['weeklyWorkoutGoalEnabled', 'weeklyWorkoutGoal', 'weekStartDay']) {
    expect(publicUserSelect).not.toHaveProperty(field)
  }
})
