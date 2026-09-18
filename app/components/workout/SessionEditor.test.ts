/**
 * Tests for app/components/workout/SessionEditor.vue
 *
 * Coverage strategy:
 *  - Loads the session by id alone (no program lookup) and announces it
 *  - COMPLETED: no Save button; a date change persists immediately
 *  - EDITING: the date is only sent on Save, which completes the session
 *  - Extra sets and swaps reach the exercise card (they used to be blanked out)
 *  - Missing session and load failure render an error instead of the editor
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import SessionEditor from './SessionEditor.vue'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)
vi.stubGlobal('nextTick', nextTick)

const toastAdd = vi.fn()
vi.stubGlobal('useToast', () => ({ add: toastAdd }))
vi.stubGlobal('useSetEditing', () => ({
  editingContext: ref(null),
  editingSet: ref(null),
  completedSet: ref(null),
  isSwapped: ref(false),
  canDelete: ref(false),
  handleEdit: vi.fn(),
  cancelEdit: vi.fn(),
  handleLog: vi.fn(),
  handleDelete: vi.fn(),
  handleAddExtraSet: vi.fn(),
  addingExtraSet: ref(true),
}))

const day = { id: 'd1', warmUp: null, exerciseGroups: [{ id: 'g1', exercises: [] }] }

function makeWorkout(status: 'COMPLETED' | 'EDITING') {
  const session = ref<Record<string, unknown> | null>(null)
  const loaded = {
    id: 'ws1', weekNumber: 2, dayNumber: 3, status,
    startedAt: new Date(2026, 2, 10, 17, 0, 0).toISOString(),
    completedAt: status === 'COMPLETED' ? new Date(2026, 2, 10, 18, 0, 0).toISOString() : null,
  }
  const extraCompletedSets = ref(new Map([['x1', { id: 'x1', programExerciseId: 'pe1' }]]))
  const exerciseSwaps = ref([{ programExerciseId: 'pe1' }])
  return {
    session,
    day: ref<typeof day | null>(null),
    completedSets: ref(new Map()),
    extraCompletedSets,
    exerciseSwaps,
    adHocGroups: ref([]),
    completing: ref(false),
    abandoning: ref(false),
    recordingSetId: ref(null),
    totalSets: ref(4),
    completedSetCount: ref(2),
    progressPercent: ref(50),
    loadSession: vi.fn(async function (this: void) {
      session.value = loaded
      workoutRef.day.value = day
      return true
    }),
    addAdHocSet: vi.fn(),
    updateCompletedAt: vi.fn().mockResolvedValue(undefined),
    swapExercise: vi.fn(),
    completeWorkout: vi.fn().mockResolvedValue({}),
    abandonWorkout: vi.fn().mockResolvedValue(undefined),
  }
}

let workoutRef: ReturnType<typeof makeWorkout>

const stubs = {
  AppSkeleton: { template: '<div data-testid="skeleton" />' },
  UAlert: { props: ['title'], template: '<div data-testid="alert">{{ title }}</div>' },
  UIcon: true,
  // The component's @click falls through onto the native button
  UButton: { template: '<button><slot /></button>' },
  UModal: { props: ['open'], template: '<div v-if="open"><slot name="body" /></div>' },
  WorkoutExerciseCard: {
    props: ['extraCompletedSets', 'exerciseSwaps', 'disableExtraSets', 'disableExerciseSwaps', 'addingExtraSet'],
    template: '<div data-testid="exercise-card" />',
  },
  WorkoutAdHocExerciseCard: {
    props: ['addingSet'],
    template: '<button data-testid="adhoc-add" :data-adding="String(!!addingSet)" @click="$emit(\'add-set\', \'Face Pulls\')" />',
  },
  WorkoutSetLogDrawer: true,
  WorkoutExerciseSearchDrawer: { template: '<button data-testid="pick-exercise" @click="$emit(\'select\', \'Face Pulls\')" />' },
  WorkoutExerciseSwapDrawer: true,
}

async function mountEditor(status: 'COMPLETED' | 'EDITING') {
  workoutRef = makeWorkout(status)
  vi.stubGlobal('useWorkoutSession', () => workoutRef)
  const wrapper = mount(SessionEditor, { props: { sessionId: 'ws1' }, global: { stubs } })
  await flushPromises()
  return wrapper
}

function buttonByText(wrapper: Awaited<ReturnType<typeof mountEditor>>, text: string) {
  return wrapper.findAll('button').filter(b => b.text() === text)
}

describe('WorkoutSessionEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('loads the session by id and announces it', async () => {
    const wrapper = await mountEditor('COMPLETED')

    expect(workoutRef.loadSession).toHaveBeenCalledWith('ws1')
    expect(wrapper.emitted('loaded')?.[0]?.[0]).toMatchObject({ id: 'ws1', weekNumber: 2, dayNumber: 3 })
    expect(wrapper.find('[data-testid="skeleton"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="exercise-card"]').exists()).toBe(true)
  })

  test('passes real extra sets and swaps to the exercise card, with both enabled', async () => {
    const wrapper = await mountEditor('COMPLETED')
    const card = wrapper.findComponent('[data-testid="exercise-card"]') as unknown as { props: (k: string) => unknown }

    expect((card.props('extraCompletedSets') as Map<string, unknown>).has('x1')).toBe(true)
    expect(card.props('exerciseSwaps')).toEqual([{ programExerciseId: 'pe1' }])
    expect(card.props('disableExtraSets')).toBeFalsy()
    expect(card.props('disableExerciseSwaps')).toBeFalsy()
  })

  test('a completed session has no Save button and persists a date change immediately', async () => {
    const wrapper = await mountEditor('COMPLETED')
    expect(buttonByText(wrapper, 'Save')).toHaveLength(0)

    const input = wrapper.find('input[type="date"]')
    expect((input.element as HTMLInputElement).value).toBe('2026-03-10')
    await input.setValue('2026-03-08')
    await input.trigger('change')
    await flushPromises()

    expect(workoutRef.updateCompletedAt).toHaveBeenCalledWith('2026-03-08')
  })

  test('tells the user when the date could not be saved', async () => {
    const wrapper = await mountEditor('COMPLETED')
    workoutRef.updateCompletedAt.mockRejectedValueOnce(new Error('boom'))

    const input = wrapper.find('input[type="date"]')
    await input.setValue('2026-03-08')
    await input.trigger('change')
    await flushPromises()

    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
    // Reverts to the date that is actually stored
    expect((input.element as HTMLInputElement).value).toBe('2026-03-10')
  })

  test('an editing session sends its date only on Save, then reports saved', async () => {
    const wrapper = await mountEditor('EDITING')

    const input = wrapper.find('input[type="date"]')
    await input.setValue('2026-03-09')
    await input.trigger('change')
    expect(workoutRef.updateCompletedAt).not.toHaveBeenCalled()

    // The page-level Save opens the dialog; the dialog's Save confirms
    await buttonByText(wrapper, 'Save')[0]!.trigger('click')
    const saves = buttonByText(wrapper, 'Save')
    expect(saves).toHaveLength(2)
    await saves[1]!.trigger('click')
    await flushPromises()

    expect(workoutRef.completeWorkout).toHaveBeenCalledWith(new Date('2026-03-09T12:00:00').toISOString())
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  test('discarding an editing session reports discarded', async () => {
    const wrapper = await mountEditor('EDITING')

    await wrapper.find('button[aria-label="Discard session"]').trigger('click')
    await buttonByText(wrapper, 'Discard')[0]!.trigger('click')
    await flushPromises()

    expect(workoutRef.abandonWorkout).toHaveBeenCalled()
    expect(wrapper.emitted('discarded')).toHaveLength(1)
  })

  // Retrying after a partial failure would add three MORE sets on top of the
  // ones that did save.
  test('reports how many ad-hoc sets were added instead of inviting a full retry', async () => {
    const wrapper = await mountEditor('COMPLETED')
    workoutRef.addAdHocSet
      .mockResolvedValueOnce({ id: 'a1' })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ id: 'a3' })

    await wrapper.find('[data-testid="pick-exercise"]').trigger('click')
    await flushPromises()

    expect(workoutRef.addAdHocSet).toHaveBeenCalledTimes(3)
    const title = toastAdd.mock.calls[0]![0].title as string
    expect(title).toContain('2 of 3')
    expect(title).toContain('Add Set')
    expect(title).not.toMatch(/try again/i)
  })

  test('invites a retry only when no ad-hoc set was added at all', async () => {
    const wrapper = await mountEditor('COMPLETED')
    workoutRef.addAdHocSet.mockRejectedValue(new Error('offline'))

    await wrapper.find('[data-testid="pick-exercise"]').trigger('click')
    await flushPromises()

    expect(toastAdd.mock.calls[0]![0].title).toMatch(/try again/i)
  })

  test('passes the extra-set pending state to the exercise card', async () => {
    const wrapper = await mountEditor('COMPLETED')
    const card = wrapper.findComponent('[data-testid="exercise-card"]') as unknown as { props: (k: string) => unknown }

    expect(card.props('addingExtraSet')).toBe(true)
  })

  test('ignores a second ad-hoc Add Set while the first is in flight, and disables the control', async () => {
    const wrapper = await mountEditor('COMPLETED')
    workoutRef.adHocGroups.value = [{ exerciseName: 'Face Pulls', sets: [] }] as never
    await nextTick()
    let finish: (v: unknown) => void = () => {}
    workoutRef.addAdHocSet.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))

    const button = wrapper.find('[data-testid="adhoc-add"]')
    await button.trigger('click')
    expect(button.attributes('data-adding')).toBe('true')
    await button.trigger('click')

    expect(workoutRef.addAdHocSet).toHaveBeenCalledTimes(1)

    finish({ id: 'a1' })
    await flushPromises()
    expect(button.attributes('data-adding')).toBe('false')
  })

  test('renders an error when the session does not exist', async () => {
    workoutRef = makeWorkout('COMPLETED')
    workoutRef.loadSession = vi.fn().mockResolvedValue(false)
    vi.stubGlobal('useWorkoutSession', () => workoutRef)

    const wrapper = mount(SessionEditor, { props: { sessionId: 'missing' }, global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="alert"]').text()).toBe('Workout not found')
    expect(wrapper.emitted('loaded')).toBeUndefined()
  })

  test('renders an error when loading fails', async () => {
    workoutRef = makeWorkout('COMPLETED')
    workoutRef.loadSession = vi.fn().mockRejectedValue(new Error('network'))
    vi.stubGlobal('useWorkoutSession', () => workoutRef)

    const wrapper = mount(SessionEditor, { props: { sessionId: 'ws1' }, global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="alert"]').text()).toBe('Failed to load workout data')
  })
})
