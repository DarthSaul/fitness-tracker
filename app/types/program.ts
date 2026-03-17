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

/** Set detail nested inside ProgramExerciseDetail. */
export interface ExerciseSetDetail {
  id: string
  setNumber: number
  reps: number | null
  weight: number | null
  rpe: number | null
  notes: string | null
}

/** Exercise detail with its sets, nested inside ExerciseGroupDetail. */
export interface ProgramExerciseDetail {
  id: string
  order: number
  exercise: { id: string; name: string; description: string | null }
  sets: ExerciseSetDetail[]
}

/** Exercise group detail nested inside ProgramDayDetail. */
export interface ExerciseGroupDetail {
  id: string
  order: number
  type: 'STANDARD' | 'SUPERSET'
  restSeconds: number | null
  exercises: ProgramExerciseDetail[]
}

/** Shape returned by GET /api/programs/days/:id. */
export interface ProgramDayDetail {
  id: string
  dayNumber: number
  name: string | null
  warmUp: string | null
  exerciseGroups: ExerciseGroupDetail[]
}
