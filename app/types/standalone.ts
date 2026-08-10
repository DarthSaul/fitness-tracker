/** Summary row from `GET /api/standalone-workouts`. */
export interface StandaloneWorkoutSummary {
  id: string
  category: string
  order: number
  name: string
  description: string | null
  createdAt: string
  _count: { groups: number }
}

export interface StandaloneWorkoutSet {
  id: string
  setNumber: number
  reps: number | null
  weight: number | null
  rpe: number | null
  notes: string | null
  effortTarget: string | null
}

export interface StandaloneWorkoutExercise {
  id: string
  order: number
  exercise: { id: string, name: string, description: string | null }
  sets: StandaloneWorkoutSet[]
}

export interface StandaloneWorkoutGroup {
  id: string
  order: number
  type: 'STANDARD' | 'SUPERSET'
  label: string | null
  restSeconds: number | null
  exercises: StandaloneWorkoutExercise[]
}

/** Full template from `GET /api/standalone-workouts/:id`. */
export interface StandaloneWorkoutDetail {
  id: string
  category: string
  order: number
  name: string
  description: string | null
  groups: StandaloneWorkoutGroup[]
}

export interface StandaloneCompletedSet {
  id: string
  standaloneWorkoutSessionId: string
  standaloneWorkoutSetId: string | null
  adhocExerciseName: string | null
  reps: number | null
  weight: number | null
  rpe: number | null
  notes: string | null
  completedAt: string
}

export interface StandaloneSession {
  id: string
  userId: string
  standaloneWorkoutId: string
  status: 'IN_PROGRESS' | 'COMPLETED'
  startedAt: string
  completedAt: string | null
  notes: string | null
}

/** Response from `GET /api/standalone-workout-sessions/:id`. */
export interface StandaloneSessionDetail {
  session: StandaloneSession & { completedSets: StandaloneCompletedSet[] }
  workout: StandaloneWorkoutDetail
}

/** One in-progress session as listed by `/active`. */
export interface ActiveStandaloneSession extends StandaloneSession {
  _count: { completedSets: number }
  standaloneWorkout: { id: string, category: string, order: number, name: string }
}
