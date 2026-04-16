import type { ProgramDayDetail } from './program'

/** Shape of a workout session record from the API. */
export interface WorkoutSession {
  id: string
  userId: string
  userProgramId: string
  weekNumber: number
  dayNumber: number
  status: 'IN_PROGRESS' | 'EDITING' | 'COMPLETED'
  startedAt: string
  completedAt: string | null
  notes: string | null
}

/** Shape of a completed set record from the API. */
export interface CompletedSetRecord {
  id: string
  workoutSessionId: string
  exerciseSetId: string | null
  programExerciseId: string | null
  reps: number | null
  weight: number | null
  rpe: number | null
  notes: string | null
  completedAt: string
}

/** A mid-workout exercise swap recorded for a session. */
export interface WorkoutExerciseSwap {
  id: string
  workoutSessionId: string
  programExerciseId: string
  originalExerciseId: string
  replacementExerciseId: string
  createdAt: string
}

/**
 * Describes what is currently being edited in the set log drawer.
 * - 'template': a prescribed set from the program (keyed by ExerciseSet.id)
 * - 'extra': a user-added extra set (keyed by CompletedSet.id)
 */
export type EditingContext =
  | { type: 'template'; exerciseSetId: string }
  | { type: 'extra'; completedSetId: string; programExerciseId: string }

/** Response from POST /api/workouts (start a workout). */
export interface StartWorkoutResponse {
  session: WorkoutSession
  day: ProgramDayDetail
}

/** Response from GET /api/workouts/active (resume/hydrate). */
export interface ActiveWorkoutResponse {
  session: WorkoutSession & {
    completedSets: CompletedSetRecord[]
    workoutExerciseSwaps: WorkoutExerciseSwap[]
  }
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

/** Response from DELETE /api/workouts/:id. */
export interface DeleteWorkoutResponse {
  deleted: boolean
}

/** Summary of a session for the program management view. */
export interface ProgramSessionSummary {
  id: string
  weekNumber: number
  dayNumber: number
  status: 'IN_PROGRESS' | 'EDITING' | 'COMPLETED'
  startedAt: string
  completedAt: string | null
  _count: { completedSets: number }
}

/** Request body for POST /api/workouts (retroactive mode). */
export interface StartWorkoutBody {
  weekNumber?: number
  dayNumber?: number
}

/** Request body for PATCH /api/workouts/:id/complete (backdating). */
export interface CompleteWorkoutBody {
  completedAt?: string
}
