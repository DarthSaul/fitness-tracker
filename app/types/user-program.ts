/** Shape returned by GET /api/user-programs for each saved program. */
export interface UserProgramSummary {
  id: string
  programId: string
  isActive: boolean
  program: { id: string; name: string; description: string | null }
}
