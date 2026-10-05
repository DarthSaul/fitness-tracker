import { describe, expect, test } from 'vitest'
import { plannedWeight, trainingDates } from './workout-fixtures'

describe('plannedWeight', () => {
  test('a percentage target uses the assumed 1RM, rounded to 5 lb', () => {
    // 70% of a 205 lb bench is 143.5 → 145
    expect(plannedWeight('Bench Press', '70% of Bench 1RM', 0)).toBe(145)
    // 60% of a 275 lb squat is 165
    expect(plannedWeight('Back Squat', '60% of Back Squat 1RM', 0)).toBe(165)
    // 37.5% of 205 is 76.9 → 75
    expect(plannedWeight('Barbell Standing Overhead Press', '37.5% of Bench 1RM', 0)).toBe(75)
  })

  test('a percentage target does not drift between weeks: the program already progresses it', () => {
    expect(plannedWeight('Deadlift', '65% of Deadlift 1RM', 1)).toBe(plannedWeight('Deadlift', '65% of Deadlift 1RM', 0))
  })

  test('an accessory without a target adds 5 lb per week', () => {
    const week1 = plannedWeight('Barbell Curls', null, 0)
    expect(week1).toBeGreaterThan(0)
    expect(plannedWeight('Barbell Curls', null, 1)).toBe(week1! + 5)
  })

  test('an empty target is treated as no target', () => {
    expect(plannedWeight('DB Incline Press', '', 0)).toBe(plannedWeight('DB Incline Press', null, 0))
  })

  test('an unknown exercise falls back by equipment', () => {
    expect(plannedWeight('DB Something New', null, 0)).toBe(30)
    expect(plannedWeight('Barbell Something New', null, 0)).toBe(95)
    expect(plannedWeight('Machine Something New', null, 0)).toBe(50)
  })

  test('bodyweight exercises carry no weight', () => {
    expect(plannedWeight('Chin Up', null, 0)).toBeNull()
    expect(plannedWeight('Dips or Bench Dips', null, 1)).toBeNull()
  })
})

describe('trainingDates', () => {
  // Noon UTC so the date arithmetic is unambiguous.
  const today = new Date('2026-10-05T12:00:00Z')
  const day = (d: Date): string => d.toISOString().slice(0, 10)

  test('returns the requested number of dates, oldest first', () => {
    const dates = trainingDates(10, today)
    expect(dates).toHaveLength(10)
    expect([...dates].sort((a, b) => a.getTime() - b.getTime())).toEqual(dates)
  })

  test('the last workout is yesterday, so the current streak is live', () => {
    expect(day(trainingDates(10, today).at(-1)!)).toBe('2026-10-04')
  })

  test('trains three days, then rests one', () => {
    expect(trainingDates(7, today).map(day)).toEqual([
      '2026-09-26', // rest 09-27
      '2026-09-28', '2026-09-29', '2026-09-30', // rest 10-01
      '2026-10-02', '2026-10-03', '2026-10-04',
    ])
  })

  test('never schedules today or later', () => {
    for (const d of trainingDates(20, today)) expect(d.getTime()).toBeLessThan(today.getTime())
  })
})
