/** Format a Date as YYYY-MM-DD string. */
export function toDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Check if two Dates represent the same calendar day. */
export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/**
 * Cells for a month calendar grid, Sunday-first: leading nulls pad the first
 * week so the 1st lands under its weekday column, one Date per day, then
 * trailing nulls pad out to a constant 6-week × 7-day grid (42 cells). The
 * fixed height keeps the card from jumping when paging between 5- and 6-week
 * months, mirroring the iOS MonthCalendarView.
 */
export function monthGridCells(year: number, monthIndex: number): (Date | null)[] {
  const first = new Date(year, monthIndex, 1)
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const cells: (Date | null)[] = Array.from({ length: first.getDay() }, () => null)
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(year, monthIndex, day))
  }
  while (cells.length < 42) {
    cells.push(null)
  }
  return cells
}
