import type { ActiveWorkoutResponse } from '~/types/workout'

/**
 * Returns the name of the first exercise in the active workout that still has
 * at least one incomplete set, or null if all sets are done.
 */
export function findNextActiveExercise(activeWorkout: ActiveWorkoutResponse | null): string | null {
  if (!activeWorkout?.day) return null
  const completedSetIds = new Set(
    activeWorkout.session.completedSets.map((s) => s.exerciseSetId),
  )
  for (const group of activeWorkout.day.exerciseGroups) {
    for (const ex of group.exercises) {
      if (ex.sets.some((s) => !completedSetIds.has(s.id))) {
        return ex.exercise.name
      }
    }
  }
  return null
}
