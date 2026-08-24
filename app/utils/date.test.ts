import { describe, test, expect } from 'vitest'
import { toDateString, isSameDay, monthGridCells } from './date'

describe('toDateString', () => {
  test('formats a local date as YYYY-MM-DD with zero padding', () => {
    expect(toDateString(new Date(2026, 7, 5))).toBe('2026-08-05')
    expect(toDateString(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('isSameDay', () => {
  test('true for two times on the same calendar day', () => {
    expect(isSameDay(new Date(2026, 7, 5, 1), new Date(2026, 7, 5, 23))).toBe(true)
  })

  test('false across days, months, and years', () => {
    expect(isSameDay(new Date(2026, 7, 5), new Date(2026, 7, 6))).toBe(false)
    expect(isSameDay(new Date(2026, 7, 5), new Date(2026, 6, 5))).toBe(false)
    expect(isSameDay(new Date(2026, 7, 5), new Date(2025, 7, 5))).toBe(false)
  })
})

describe('monthGridCells', () => {
  test('always returns a constant 6-week grid of 42 cells', () => {
    // Aug 2026 (Sat 1st, 31 days) and Feb 2026 (Sun 1st, 28 days)
    expect(monthGridCells(2026, 7)).toHaveLength(42)
    expect(monthGridCells(2026, 1)).toHaveLength(42)
  })

  test('pads leading blanks so the 1st lands under its weekday column', () => {
    // Aug 1, 2026 is a Saturday → six leading nulls (Sun..Fri)
    const cells = monthGridCells(2026, 7)
    expect(cells.slice(0, 6)).toEqual([null, null, null, null, null, null])
    expect(cells[6]).toEqual(new Date(2026, 7, 1))
  })

  test('has no leading blanks when the month starts on Sunday', () => {
    // Feb 1, 2026 is a Sunday
    const cells = monthGridCells(2026, 1)
    expect(cells[0]).toEqual(new Date(2026, 1, 1))
  })

  test('lists every day of the month in order, then trailing blanks', () => {
    const cells = monthGridCells(2026, 7)
    const days = cells.filter((c): c is Date => c !== null)
    expect(days).toHaveLength(31)
    expect(days[0]).toEqual(new Date(2026, 7, 1))
    expect(days[30]).toEqual(new Date(2026, 7, 31))
    // 6 leading + 31 days = 37 → five trailing nulls
    expect(cells.slice(37)).toEqual([null, null, null, null, null])
  })
})
