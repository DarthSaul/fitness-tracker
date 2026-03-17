/** Shape returned by GET /api/programs for each program in the library. */
export interface ProgramSummary {
  id: string
  name: string
  description: string | null
  createdAt: string
  _count: { weeks: number }
}

/** Week summary nested inside ProgramDetail. */
export interface ProgramWeekSummary {
  id: string
  weekNumber: number
  days: string[]
}

/** Shape returned by GET /api/programs/:id. */
export interface ProgramDetail {
  id: string
  name: string
  description: string | null
  createdAt: string
  weeks: ProgramWeekSummary[]
}
