/**
 * Tests for app/composables/useSetEditing.ts
 *
 * Coverage strategy:
 *  - editingSet resolves the drawer's set for template, extra and ad-hoc contexts
 *  - handleLog records a new template set, updates an existing one, and routes
 *    extra / ad-hoc sets to updateExtraSet
 *  - handleDelete routes by context type
 *  - handleAddExtraSet creates the set and opens it for editing
 *  - canDelete / isSwapped / completedSet helpers
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, computed } from 'vue'
import type { CompletedSetRecord } from '~/types/workout'
import { useSetEditing } from './useSetEditing'

function record(id: string, extra: Partial<CompletedSetRecord> = {}): CompletedSetRecord {
  return {
    id,
    workoutSessionId: 'ws1',
    exerciseSetId: null,
    programExerciseId: null,
    adhocExerciseName: null,
    reps: 8,
    weight: 100,
    rpe: null,
    notes: null,
    ...extra,
  } as CompletedSetRecord
}

function templateSet(id: string, setNumber: number) {
  return { id, setNumber, reps: 10, weight: null, rpe: null, notes: null, effortTarget: null }
}

function makeWorkout() {
  const completedSets = ref(new Map<string, CompletedSetRecord>())
  const extraCompletedSets = ref(new Map<string, CompletedSetRecord>())
  const adHocGroups = computed(() => {
    const grouped = new Map<string, CompletedSetRecord[]>()
    for (const cs of extraCompletedSets.value.values()) {
      if (!cs.adhocExerciseName) continue
      grouped.set(cs.adhocExerciseName, [...(grouped.get(cs.adhocExerciseName) ?? []), cs])
    }
    return [...grouped.entries()].map(([exerciseName, sets]) => ({ exerciseName, sets }))
  })
  return {
    day: ref({
      id: 'd1',
      exerciseGroups: [{
        id: 'g1',
        exercises: [{ id: 'pe1', sets: [templateSet('s1', 1), templateSet('s2', 2)] }],
      }],
    }),
    completedSets,
    extraCompletedSets,
    exerciseSwaps: ref<Array<{ programExerciseId: string }>>([]),
    adHocGroups,
    recordSet: vi.fn().mockResolvedValue(undefined),
    updateSet: vi.fn().mockResolvedValue(undefined),
    deleteCompletedSet: vi.fn().mockResolvedValue(undefined),
    addExtraSet: vi.fn(),
    deleteExtraSet: vi.fn().mockResolvedValue(undefined),
    updateExtraSet: vi.fn().mockResolvedValue(undefined),
  }
}

describe('useSetEditing', () => {
  // Real reactivity: the setup stubs evaluate computed once and cache it
  beforeEach(() => {
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('computed', computed)
  })

  afterEach(() => {
    vi.stubGlobal('ref', (val: unknown) => ({ value: val }))
    vi.stubGlobal('computed', (fn: () => unknown) => ({ value: fn() }))
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setup = (workout: ReturnType<typeof makeWorkout>) => useSetEditing(workout as any)

  test('nothing is being edited initially', () => {
    const editing = setup(makeWorkout())

    expect(editing.editingContext.value).toBeNull()
    expect(editing.editingSet.value).toBeNull()
    expect(editing.canDelete.value).toBe(false)
  })

  test('resolves a template set and records it when not yet logged', async () => {
    const workout = makeWorkout()
    const editing = setup(workout)

    editing.handleEdit({ type: 'template', exerciseSetId: 's2' })
    expect(editing.editingSet.value).toMatchObject({ id: 's2', setNumber: 2 })
    expect(editing.canDelete.value).toBe(false)

    await editing.handleLog(5, 80)

    expect(workout.recordSet).toHaveBeenCalledWith('s2', { reps: 5, weight: 80 })
    expect(workout.updateSet).not.toHaveBeenCalled()
    expect(editing.editingContext.value).toBeNull()
  })

  test('updates a template set that is already logged', async () => {
    const workout = makeWorkout()
    workout.completedSets.value.set('s1', record('cs1', { exerciseSetId: 's1' }))
    const editing = setup(workout)

    editing.handleEdit({ type: 'template', exerciseSetId: 's1' })
    expect(editing.completedSet.value?.id).toBe('cs1')
    expect(editing.canDelete.value).toBe(true)

    await editing.handleLog(6, 90)

    expect(workout.updateSet).toHaveBeenCalledWith('s1', { reps: 6, weight: 90 })
    expect(workout.recordSet).not.toHaveBeenCalled()
  })

  test('numbers an extra set after the template sets', () => {
    const workout = makeWorkout()
    workout.extraCompletedSets.value.set('x1', record('x1', { programExerciseId: 'pe1' }))
    workout.extraCompletedSets.value.set('x2', record('x2', { programExerciseId: 'pe1', reps: 12 }))
    const editing = setup(workout)

    editing.handleEdit({ type: 'extra', completedSetId: 'x2', programExerciseId: 'pe1' })

    expect(editing.editingSet.value).toMatchObject({ id: 'x2', setNumber: 4, reps: 12 })
    expect(editing.canDelete.value).toBe(true)
  })

  test('numbers an ad-hoc set within its exercise group', () => {
    const workout = makeWorkout()
    workout.extraCompletedSets.value.set('a1', record('a1', { adhocExerciseName: 'Face Pulls' }))
    workout.extraCompletedSets.value.set('a2', record('a2', { adhocExerciseName: 'Face Pulls' }))
    const editing = setup(workout)

    editing.handleEdit({ type: 'adhoc', completedSetId: 'a2' })

    expect(editing.editingSet.value).toMatchObject({ id: 'a2', setNumber: 2 })
  })

  test.each([
    ['extra', { type: 'extra', completedSetId: 'x1', programExerciseId: 'pe1' }],
    ['adhoc', { type: 'adhoc', completedSetId: 'x1' }],
  ] as const)('logs and deletes an %s set through the extra-set actions', async (_label, ctx) => {
    const workout = makeWorkout()
    workout.extraCompletedSets.value.set('x1', record('x1', { programExerciseId: 'pe1', adhocExerciseName: 'Face Pulls' }))
    const editing = setup(workout)

    editing.handleEdit(ctx)
    await editing.handleLog(10, 20)
    expect(workout.updateExtraSet).toHaveBeenCalledWith('x1', { reps: 10, weight: 20 })

    editing.handleEdit(ctx)
    await editing.handleDelete()
    expect(workout.deleteExtraSet).toHaveBeenCalledWith('x1')
    expect(editing.editingContext.value).toBeNull()
  })

  test('deletes a logged template set', async () => {
    const workout = makeWorkout()
    workout.completedSets.value.set('s1', record('cs1', { exerciseSetId: 's1' }))
    const editing = setup(workout)

    editing.handleEdit({ type: 'template', exerciseSetId: 's1' })
    await editing.handleDelete()

    expect(workout.deleteCompletedSet).toHaveBeenCalledWith('s1')
  })

  test('adding an extra set opens it for editing', async () => {
    const workout = makeWorkout()
    workout.addExtraSet.mockResolvedValueOnce(record('x9', { programExerciseId: 'pe1' }))
    const editing = setup(workout)

    await editing.handleAddExtraSet('pe1')

    expect(workout.addExtraSet).toHaveBeenCalledWith('pe1', {})
    expect(editing.editingContext.value).toEqual({ type: 'extra', completedSetId: 'x9', programExerciseId: 'pe1' })
  })

  test('flags a template set whose exercise was swapped', () => {
    const workout = makeWorkout()
    workout.exerciseSwaps.value = [{ programExerciseId: 'pe1' }]
    const editing = setup(workout)

    editing.handleEdit({ type: 'template', exerciseSetId: 's1' })

    expect(editing.isSwapped.value).toBe(true)
  })

  // Clearing the context before the save resolved closed the drawer on a failed
  // request and threw away what the user had typed.
  test('keeps the set open when saving fails, so the input is not lost', async () => {
    const workout = makeWorkout()
    workout.recordSet.mockRejectedValueOnce(new Error('offline'))
    const editing = setup(workout)

    editing.handleEdit({ type: 'template', exerciseSetId: 's1' })
    await expect(editing.handleLog(5, 80)).rejects.toThrow('offline')

    expect(editing.editingContext.value).toEqual({ type: 'template', exerciseSetId: 's1' })

    // ...and a retry still works
    await editing.handleLog(5, 80)
    expect(workout.recordSet).toHaveBeenCalledTimes(2)
    expect(editing.editingContext.value).toBeNull()
  })

  test('keeps the set open when deleting fails', async () => {
    const workout = makeWorkout()
    workout.completedSets.value.set('s1', record('cs1', { exerciseSetId: 's1' }))
    workout.deleteCompletedSet.mockRejectedValueOnce(new Error('offline'))
    const editing = setup(workout)

    editing.handleEdit({ type: 'template', exerciseSetId: 's1' })
    await expect(editing.handleDelete()).rejects.toThrow('offline')

    expect(editing.editingContext.value).not.toBeNull()
  })

  test('ignores a second submission while the first is in flight', async () => {
    const workout = makeWorkout()
    let finish: () => void = () => {}
    workout.recordSet.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    const editing = setup(workout)

    editing.handleEdit({ type: 'template', exerciseSetId: 's1' })
    const first = editing.handleLog(5, 80)
    await editing.handleLog(5, 80)
    await editing.handleDelete()

    expect(workout.recordSet).toHaveBeenCalledTimes(1)
    expect(workout.deleteCompletedSet).not.toHaveBeenCalled()

    finish()
    await first
    expect(editing.editingContext.value).toBeNull()
  })

  test('log and delete are no-ops when nothing is being edited', async () => {
    const workout = makeWorkout()
    const editing = setup(workout)

    await editing.handleLog(1, 1)
    await editing.handleDelete()

    expect(workout.recordSet).not.toHaveBeenCalled()
    expect(workout.deleteCompletedSet).not.toHaveBeenCalled()
  })
})
