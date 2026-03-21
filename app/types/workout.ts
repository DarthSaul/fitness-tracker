import type { ProgramDayDetail } from './program'

/** Shape of a workout session record from the API. */
export interface WorkoutSession {
  id: string
  userId: string
  userProgramId: string
  weekNumber: number
  dayNumber: number
  status: 'IN_PROGRESS' | 'COMPLETED'
  startedAt: string
  completedAt: string | null
}

/** Shape of a completed set record from the API. */
export interface CompletedSetRecord {
  id: string
  workoutSessionId: string
  exerciseSetId: string
  reps: number | null
  weight: number | null
  rpe: number | null
  notes: string | null
  completedAt: string
}

/** Response from POST /api/workouts (start a workout). */
export interface StartWorkoutResponse {
  session: WorkoutSession
  day: ProgramDayDetail
}

/** Response from GET /api/workouts/active (resume/hydrate). */
export interface ActiveWorkoutResponse {
  session: WorkoutSession & { completedSets: CompletedSetRecord[] }
  day: ProgramDayDetail
}

/** Response from PATCH /api/workouts/:id/complete. */
export interface CompleteWorkoutResponse {
  session: WorkoutSession
  userProgram: {
    id: string
    isActive: boolean
    currentWeek: number
    currentDay: number
  }
  programCompleted: boolean
}
