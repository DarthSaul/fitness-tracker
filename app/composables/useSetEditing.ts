import type { AdHocExerciseGroup, CompletedSetRecord, EditingContext } from '~/types/workout'
import type { ExerciseSetDetail } from '~/types/program'

type WorkoutSessionApi = ReturnType<typeof useWorkoutSession>

/** The slice of `useWorkoutSession()` that set editing depends on. */
type SetEditingSource = Pick<
  WorkoutSessionApi,
  | 'day' | 'completedSets' | 'extraCompletedSets' | 'exerciseSwaps' | 'adHocGroups'
  | 'recordSet' | 'updateSet' | 'deleteCompletedSet'
  | 'addExtraSet' | 'deleteExtraSet' | 'updateExtraSet'
>

/**
 * State and actions behind the set log drawer: which set is open (template,
 * extra or ad-hoc), the detail to show for it, and how log / delete are routed.
 * Shared by the live workout and the finished-session editor so both handle
 * every set type the same way.
 */
export function useSetEditing(workout: SetEditingSource) {
  const { day, completedSets, extraCompletedSets, exerciseSwaps, adHocGroups } = workout

  const editingContext = ref<EditingContext | null>(null)
  // True while a log/delete is being persisted; blocks a second submission
  const persisting = ref(false)

  /** The logged record behind the open set, if it has been logged. */
  const completedSet = computed<CompletedSetRecord | null>(() => {
    const ctx = editingContext.value
    if (!ctx) return null
    if (ctx.type === 'template') return completedSets.value.get(ctx.exerciseSetId) ?? null
    return extraCompletedSets.value.get(ctx.completedSetId) ?? null
  })

  /** True when the open template set belongs to an exercise swapped for this session. */
  const isSwapped = computed(() => {
    const ctx = editingContext.value
    if (!ctx || ctx.type !== 'template' || !day.value) return false
    for (const group of day.value.exerciseGroups) {
      for (const ex of group.exercises) {
        if (ex.sets.some(s => s.id === ctx.exerciseSetId)) {
          return exerciseSwaps.value.some(swap => swap.programExerciseId === ex.id)
        }
      }
    }
    return false
  })

  /** Extra and ad-hoc sets always exist as records; a template set only once logged. */
  const canDelete = computed(() => {
    const ctx = editingContext.value
    if (!ctx) return false
    if (ctx.type === 'template') return completedSets.value.has(ctx.exerciseSetId)
    return true
  })

  /** The set detail the drawer renders for the open set. */
  const editingSet = computed<ExerciseSetDetail | null>(() => {
    const ctx = editingContext.value
    if (!ctx) return null

    if (ctx.type === 'template') {
      if (!day.value) return null
      for (const group of day.value.exerciseGroups) {
        for (const ex of group.exercises) {
          const found = ex.sets.find(s => s.id === ctx.exerciseSetId)
          if (found) return found
        }
      }
      return null
    }

    if (ctx.type === 'extra') {
      if (!day.value) return null
      const existing = extraCompletedSets.value.get(ctx.completedSetId)
      const peId = ctx.programExerciseId
      let templateSetCount = 0
      for (const group of day.value.exerciseGroups) {
        const ex = group.exercises.find(e => e.id === peId)
        if (ex) { templateSetCount = ex.sets.length; break }
      }
      const extrasForExercise = Array.from(extraCompletedSets.value.values())
        .filter(s => s.programExerciseId === peId)
      const extraIndex = extrasForExercise.findIndex(s => s.id === ctx.completedSetId)
      return {
        id: ctx.completedSetId,
        setNumber: templateSetCount + (extraIndex >= 0 ? extraIndex + 1 : extrasForExercise.length + 1),
        reps: existing?.reps ?? null,
        weight: existing?.weight ?? null,
        rpe: existing?.rpe ?? null,
        notes: existing?.notes ?? null,
        effortTarget: null,
      }
    }

    const cs = extraCompletedSets.value.get(ctx.completedSetId)
    if (!cs) return null
    const group = adHocGroups.value.find((g: AdHocExerciseGroup) => g.sets.some(s => s.id === ctx.completedSetId))
    const setNumber = group ? group.sets.findIndex(s => s.id === ctx.completedSetId) + 1 : 1
    return {
      id: ctx.completedSetId,
      setNumber,
      reps: cs.reps,
      weight: cs.weight,
      rpe: cs.rpe,
      notes: cs.notes,
      effortTarget: null,
    }
  })

  function handleEdit(context: EditingContext): void {
    editingContext.value = context
  }

  function cancelEdit(): void {
    editingContext.value = null
  }

  /**
   * Runs a write for the open set. The context is cleared only once the write
   * succeeds, so a failed save leaves the drawer — and what was typed — in place.
   */
  async function persist(write: (ctx: EditingContext) => Promise<void>): Promise<void> {
    const ctx = editingContext.value
    if (!ctx || persisting.value) return
    persisting.value = true
    try {
      await write(ctx)
      // Leave a set the user opened in the meantime alone
      if (editingContext.value === ctx) editingContext.value = null
    } finally {
      persisting.value = false
    }
  }

  function handleLog(reps: number | null, weight: number | null): Promise<void> {
    return persist(async (ctx) => {
      if (ctx.type === 'template') {
        if (completedSets.value.has(ctx.exerciseSetId)) {
          await workout.updateSet(ctx.exerciseSetId, { reps, weight })
        } else {
          await workout.recordSet(ctx.exerciseSetId, { reps, weight })
        }
      } else {
        await workout.updateExtraSet(ctx.completedSetId, { reps, weight })
      }
    })
  }

  function handleDelete(): Promise<void> {
    return persist(async (ctx) => {
      if (ctx.type === 'template') {
        await workout.deleteCompletedSet(ctx.exerciseSetId)
      } else {
        await workout.deleteExtraSet(ctx.completedSetId)
      }
    })
  }

  /** Creates a blank extra set and opens it so the user can fill it in. */
  async function handleAddExtraSet(programExerciseId: string): Promise<void> {
    const newSet = await workout.addExtraSet(programExerciseId, {})
    editingContext.value = { type: 'extra', completedSetId: newSet.id, programExerciseId }
  }

  return {
    editingContext,
    editingSet,
    completedSet,
    isSwapped,
    canDelete,
    handleEdit,
    cancelEdit,
    handleLog,
    handleDelete,
    handleAddExtraSet,
  }
}
