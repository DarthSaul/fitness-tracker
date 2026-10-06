import { describe, test, expect, vi, beforeEach } from 'vitest'

import { weekBounds, parseTimeZoneParam, completedWorkoutsBetween } from './week'

const at = (iso: string) => new Date(iso)
const iso = (bounds: { start: Date; end: Date }) => ({ start: bounds.start.toISOString(), end: bounds.end.toISOString() })
const HOUR = 3_600_000

describe('weekBounds', () => {
  // Wednesday 2026-10-07, noon UTC.
  const wednesday = at('2026-10-07T12:00:00.000Z')

  test.each([
    ['SUNDAY', '2026-10-04'],
    ['MONDAY', '2026-10-05'],
    ['TUESDAY', '2026-10-06'],
    ['WEDNESDAY', '2026-10-07'],
    ['THURSDAY', '2026-10-01'],
    ['FRIDAY', '2026-10-02'],
    ['SATURDAY', '2026-10-03'],
  ] as const)('a week starting %s contains Wednesday from %s', (day, startDate) => {
    const { start, end } = weekBounds(wednesday, day, 'UTC')
    expect(start.toISOString()).toBe(`${startDate}T00:00:00.000Z`)
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * HOUR)
  })

  test('the start instant itself belongs to the new week', () => {
    expect(iso(weekBounds(at('2026-10-04T00:00:00.000Z'), 'SUNDAY', 'UTC')))
      .toEqual({ start: '2026-10-04T00:00:00.000Z', end: '2026-10-11T00:00:00.000Z' })
  })

  test('the last millisecond before the next start still belongs to this week (end is exclusive)', () => {
    expect(iso(weekBounds(at('2026-10-10T23:59:59.999Z'), 'SUNDAY', 'UTC')))
      .toEqual({ start: '2026-10-04T00:00:00.000Z', end: '2026-10-11T00:00:00.000Z' })
  })

  test('a Sunday is the end of a Monday-start week', () => {
    expect(weekBounds(at('2026-10-04T12:00:00.000Z'), 'MONDAY', 'UTC').start.toISOString()).toBe('2026-09-28T00:00:00.000Z')
  })

  test('uses the local day: Saturday 23:30 in Chicago is already Sunday in UTC', () => {
    // 2026-10-04T04:30Z = Sat Oct 3, 23:30 CDT (UTC−5).
    expect(iso(weekBounds(at('2026-10-04T04:30:00.000Z'), 'SUNDAY', 'America/Chicago')))
      .toEqual({ start: '2026-09-27T05:00:00.000Z', end: '2026-10-04T05:00:00.000Z' })
    // Local midnight Sunday starts the next week.
    expect(weekBounds(at('2026-10-04T05:00:00.000Z'), 'SUNDAY', 'America/Chicago').start.toISOString())
      .toBe('2026-10-04T05:00:00.000Z')
  })

  test('a zone ahead of UTC with a half-hour offset (Asia/Kolkata)', () => {
    // 2026-10-03T20:00Z = Sun Oct 4, 01:30 IST.
    expect(weekBounds(at('2026-10-03T20:00:00.000Z'), 'SUNDAY', 'Asia/Kolkata').start.toISOString())
      .toBe('2026-10-03T18:30:00.000Z')
  })

  test('the week DST ends in is 169 hours, and both edges are local midnight', () => {
    // US DST ends Sun 2026-11-01 02:00 CDT → 01:00 CST.
    const { start, end } = weekBounds(at('2026-11-04T18:00:00.000Z'), 'SUNDAY', 'America/Chicago')
    expect(start.toISOString()).toBe('2026-11-01T05:00:00.000Z') // 00:00 CDT
    expect(end.toISOString()).toBe('2026-11-08T06:00:00.000Z') // 00:00 CST
    expect(end.getTime() - start.getTime()).toBe(169 * HOUR)
  })

  test('the week DST starts in is 167 hours', () => {
    // US DST starts Sun 2027-03-14 02:00 CST → 03:00 CDT.
    const { start, end } = weekBounds(at('2027-03-16T18:00:00.000Z'), 'SUNDAY', 'America/Chicago')
    expect(start.toISOString()).toBe('2027-03-14T06:00:00.000Z') // 00:00 CST
    expect(end.toISOString()).toBe('2027-03-21T05:00:00.000Z') // 00:00 CDT
    expect(end.getTime() - start.getTime()).toBe(167 * HOUR)
  })

  test('a start-day midnight skipped by DST begins the week at the first instant that exists', () => {
    // Chile springs forward Sun 2026-09-06 00:00 → 01:00, so 00:00 never happens.
    // 03:59Z is still Saturday 23:59 (UTC−4); 04:00Z is Sunday 01:00 (UTC−3).
    expect(weekBounds(at('2026-09-09T15:00:00.000Z'), 'SUNDAY', 'America/Santiago').start.toISOString())
      .toBe('2026-09-06T04:00:00.000Z')
  })

  test('a fixed offset in minutes (the dashboard\'s legacy tzOffset) has no DST', () => {
    // −300 = UTC−5 all year: Sat 23:30 local.
    expect(iso(weekBounds(at('2026-10-04T04:30:00.000Z'), 'SUNDAY', -300)))
      .toEqual({ start: '2026-09-27T05:00:00.000Z', end: '2026-10-04T05:00:00.000Z' })
    // Across the November change it stays a flat 168 hours.
    const { start, end } = weekBounds(at('2026-11-04T18:00:00.000Z'), 'SUNDAY', -300)
    expect(end.getTime() - start.getTime()).toBe(168 * HOUR)
  })
})

describe('parseTimeZoneParam', () => {
  test('absent → undefined, so the caller falls back', () => {
    expect(parseTimeZoneParam(undefined)).toBeUndefined()
  })

  test('a named IANA zone is returned as-is', () => {
    expect(parseTimeZoneParam('America/Chicago')).toBe('America/Chicago')
  })

  test.each([
    ['empty', ''],
    ['unknown', 'Mars/Olympus_Mons'],
    ['a raw offset', '-05:00'],
    ['repeated (an array)', ['UTC', 'UTC']],
  ])('400 for %s', (_label, raw) => {
    expect(() => parseTimeZoneParam(raw)).toThrow(expect.objectContaining({ statusCode: 400 }))
  })
})

describe('completedWorkoutsBetween', () => {
  const programCount = (prisma as typeof prisma).workoutSession.count as ReturnType<typeof vi.fn>
  const standaloneCount = (prisma as typeof prisma).standaloneWorkoutSession.count as ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('sums COMPLETED program and standalone sessions with completedAt in [start, end)', async () => {
    programCount.mockResolvedValueOnce(2)
    standaloneCount.mockResolvedValueOnce(1)
    const start = at('2026-10-04T05:00:00.000Z')
    const end = at('2026-10-11T05:00:00.000Z')

    expect(await completedWorkoutsBetween('user001', start, end)).toBe(3)

    const where = { userId: 'user001', status: 'COMPLETED', completedAt: { gte: start, lt: end } }
    expect(programCount).toHaveBeenCalledWith({ where })
    expect(standaloneCount).toHaveBeenCalledWith({ where })
  })
})
