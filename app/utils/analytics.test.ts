import { describe, test, expect } from 'vitest'
import type { AnalyticsSessionEntry } from '~/composables/useAnalytics'
import {
  SPARKLINE_GEOMETRY,
  buildSparkline,
  toPolylinePoints,
  formatVolume,
  formatE1rm,
  formatSessionDate,
} from './analytics'

function session(bestE1rm: number | null, id = 's1'): AnalyticsSessionEntry {
  return {
    sessionId: id,
    completedAt: '2026-01-15T10:00:00.000Z',
    weekNumber: 1,
    dayNumber: 1,
    bestE1rm,
    sets: [],
  } as unknown as AnalyticsSessionEntry
}

const { padX, padY, width, height } = SPARKLINE_GEOMETRY

describe('buildSparkline', () => {
  test('returns nothing for an empty history', () => {
    expect(buildSparkline([])).toEqual([])
  })

  // Plotting a null e1RM at zero would read as a strength collapse.
  test('drops sessions with no e1RM', () => {
    const points = buildSparkline([session(100, 'a'), session(null, 'b'), session(120, 'c')])

    expect(points).toHaveLength(2)
    expect(points.map(p => p.session.sessionId)).toEqual(['a', 'c'])
  })

  test('returns nothing when every session lacks an e1RM', () => {
    expect(buildSparkline([session(null), session(null)])).toEqual([])
  })

  test('centres a single point horizontally', () => {
    const [point] = buildSparkline([session(100)])

    expect(point!.x).toBe(padX + width / 2)
  })

  // A flat series has zero range; dividing by it would emit NaN into the SVG.
  test('centres a flat series vertically instead of dividing by zero', () => {
    const points = buildSparkline([session(100, 'a'), session(100, 'b')])

    expect(points.map(p => p.y)).toEqual([padY + height / 2, padY + height / 2])
    expect(points.every(p => Number.isFinite(p.y))).toBe(true)
  })

  test('spans the full plot width and inverts the y axis', () => {
    const points = buildSparkline([session(100, 'a'), session(150, 'b'), session(200, 'c')])

    expect(points.map(p => p.x)).toEqual([padX, padX + width / 2, padX + width])
    // Lowest e1RM sits at the bottom of the plot, highest at the top.
    expect(points[0]!.y).toBe(padY + height)
    expect(points[1]!.y).toBe(padY + height / 2)
    expect(points[2]!.y).toBe(padY)
  })

  test('accepts custom geometry', () => {
    const points = buildSparkline([session(100)], { padX: 0, padY: 0, width: 100, height: 50 })

    expect(points[0]!.x).toBe(50)
  })
})

describe('toPolylinePoints', () => {
  test('joins points into an SVG points attribute', () => {
    const points = buildSparkline([session(100, 'a'), session(200, 'b')])

    expect(toPolylinePoints(points)).toBe(`${padX},${padY + height} ${padX + width},${padY}`)
  })

  test('returns an empty string for no points', () => {
    expect(toPolylinePoints([])).toBe('')
  })
})

describe('formatVolume', () => {
  test.each([
    [0, '0'],
    [999, '999'],
    [1000, '1.0k'],
    [12420, '12.4k'],
  ])('formats %i as %s', (lbs, expected) => {
    expect(formatVolume(lbs)).toBe(expected)
  })
})

describe('formatE1rm', () => {
  test('rounds to whole pounds', () => {
    expect(formatE1rm(157.6)).toBe('158 lbs')
  })
})

describe('formatSessionDate', () => {
  test('renders a short US date', () => {
    expect(formatSessionDate('2026-01-15T10:00:00.000Z')).toBe('Jan 15, 2026')
  })
})
