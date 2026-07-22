/** One exercise row within a PT routine. Exactly one of durationSeconds/reps is set. */
export interface PtRoutineExercise {
  id: string
  ptRoutineId: string
  order: number
  title: string
  durationSeconds: number | null
  reps: number | null
}

/** Shape returned by /api/pt-routines endpoints for each routine. */
export interface PtRoutine {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  exercises: PtRoutineExercise[]
}

/** Client payload for an exercise in POST/PATCH bodies — order is the array index. */
export interface PtRoutineExerciseInput {
  title: string
  durationSeconds: number | null
  reps: number | null
}
