/** A completed program workout as returned by `GET /api/history`. */
export interface ProgramHistoryEntry {
  type: 'PROGRAM'
  id: string
  userId: string
  userProgramId: string
  programName: string
  weekNumber: number
  dayNumber: number
  status: 'COMPLETED'
  startedAt: string
  completedAt: string
  notes: string | null
  _count: { completedSets: number }
}

/** A completed "Strength on the Go" session as returned by `GET /api/history`. */
export interface StandaloneHistoryEntry {
  type: 'STANDALONE'
  id: string
  userId: string
  standaloneWorkoutId: string
  standaloneWorkout: {
    id: string
    name: string
    category: string
    order: number
  }
  status: 'COMPLETED'
  startedAt: string
  completedAt: string
  notes: string | null
  _count: { completedSets: number }
}

/** Discriminated on `type` — the unified history interleaves both kinds. */
export type HistoryEntry = ProgramHistoryEntry | StandaloneHistoryEntry

export interface HistoryResponse {
  sessions: HistoryEntry[]
}
