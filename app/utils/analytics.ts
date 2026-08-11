import type { AnalyticsSessionEntry } from '~/composables/useAnalytics'

/**
 * Geometry of the e1RM sparkline, in the SVG's own user units.
 *
 * The chart is drawn into a 300×80 viewBox; the padding keeps the stroke and
 * the point markers from being clipped at the edges.
 */
export interface SparklineGeometry {
  padX: number
  padY: number
  width: number
  height: number
}

export const SPARKLINE_GEOMETRY: SparklineGeometry = {
  padX: 16,
  padY: 8,
  width: 268, // 300 - padX * 2
  height: 64, // 80  - padY * 2
}

export interface SparklinePoint {
  x: number
  y: number
  session: AnalyticsSessionEntry
}

/**
 * Projects a chronological run of sessions onto sparkline coordinates.
 *
 * Sessions without an e1RM are dropped rather than plotted at zero, which
 * would read as a strength collapse. A single point is centred horizontally,
 * and a flat series is centred vertically — both avoid a divide-by-zero that
 * would otherwise emit NaN into the SVG and render nothing at all.
 */
export function buildSparkline(
  sessions: AnalyticsSessionEntry[],
  geometry: SparklineGeometry = SPARKLINE_GEOMETRY,
): SparklinePoint[] {
  const plotted = sessions.filter(session => session.bestE1rm !== null)
  if (plotted.length === 0) return []

  const values = plotted.map(session => session.bestE1rm as number)
  const min = Math.min(...values)
  const range = Math.max(...values) - min

  return plotted.map((session, index) => {
    const x = geometry.padX + (plotted.length === 1
      ? geometry.width / 2
      : (index / (plotted.length - 1)) * geometry.width)

    const y = range === 0
      ? geometry.padY + geometry.height / 2
      : geometry.padY + geometry.height - (((session.bestE1rm as number) - min) / range) * geometry.height

    return { x, y, session }
  })
}

/** Serialises sparkline points for an SVG `<polyline points>` attribute. */
export function toPolylinePoints(points: SparklinePoint[]): string {
  return points.map(point => `${point.x},${point.y}`).join(' ')
}

/** Compacts large volume totals, e.g. 12420 → "12.4k". */
export function formatVolume(lbs: number): string {
  return lbs >= 1000 ? `${(lbs / 1000).toFixed(1)}k` : lbs.toFixed(0)
}

export function formatE1rm(e1rm: number): string {
  return `${Math.round(e1rm)} lbs`
}

export function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
