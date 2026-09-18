/**
 * Shape returned by GET /api/user-programs. Each row is one RUN through a
 * program; by default the API returns one current run per program (the open
 * run, else the most recently completed one).
 */
export interface UserProgramSummary {
  id: string
  programId: string
  isActive: boolean
  currentWeek: number
  currentDay: number
  /** Set once the final day is completed. Starting the program again creates a new run. */
  completedAt: string | null
  /** Set when the run was unsaved but kept for its history. Only present with `?runs=all`. */
  archivedAt: string | null
  /** 1-based position of this run among the user's runs of the program. */
  runNumber: number
  completedRunCount: number
  program: { id: string; name: string; description: string | null }
}
