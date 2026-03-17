/** Shape returned by GET /api/programs for each program in the library. */
export interface ProgramSummary {
  id: string
  name: string
  description: string | null
  createdAt: string
  _count: { weeks: number }
}
