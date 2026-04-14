import { describe, test, expect, vi } from 'vitest'
import { ref, computed, watch, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import ExtraSetRow from './ExtraSetRow.vue'

// vitest.setup.ts stubs ref/computed for composable tests; restore real Vue
// reactivity so the component's setup() function runs correctly when mounted.
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('nextTick', nextTick)

const makeCompletedSet = (overrides: Partial<{
  id: string
  workoutSessionId: string
  exerciseSetId: string | null
  programExerciseId: string | null
  reps: number | null
  weight: number | null
  rpe: number | null
  notes: string | null
  completedAt: string
}> = {}) => ({
  id: 'cs001',
  workoutSessionId: 'ws001',
  exerciseSetId: null,
  programExerciseId: 'pe001',
  reps: 10,
  weight: 135,
  rpe: null,
  notes: null,
  completedAt: new Date().toISOString(),
  ...overrides,
})

describe('ExtraSetRow', () => {
  test('renders the correct set number', () => {
    const wrapper = mount(ExtraSetRow, {
      props: {
        setNumber: 4,
        completedSet: makeCompletedSet(),
        loading: false,
        editable: true,
      },
      global: { stubs: { UIcon: true } },
    })
    expect(wrapper.text()).toContain('4')
  })

  test('renders completed weight in green', () => {
    const wrapper = mount(ExtraSetRow, {
      props: {
        setNumber: 1,
        completedSet: makeCompletedSet({ weight: 135 }),
        loading: false,
        editable: false,
      },
      global: { stubs: { UIcon: true } },
    })
    expect(wrapper.text()).toContain('135')
  })

  test('renders completed reps in green', () => {
    const wrapper = mount(ExtraSetRow, {
      props: {
        setNumber: 1,
        completedSet: makeCompletedSet({ reps: 10 }),
        loading: false,
        editable: false,
      },
      global: { stubs: { UIcon: true } },
    })
    expect(wrapper.text()).toContain('10')
  })

  test('shows — when weight is null', () => {
    const wrapper = mount(ExtraSetRow, {
      props: {
        setNumber: 1,
        completedSet: makeCompletedSet({ weight: null }),
        loading: false,
        editable: false,
      },
      global: { stubs: { UIcon: true } },
    })
    // The weight column renders — when null
    const spans = wrapper.findAll('span')
    const weightSpan = spans[1]
    expect(weightSpan?.text()).toBe('—')
  })

  test('shows — when reps is null', () => {
    const wrapper = mount(ExtraSetRow, {
      props: {
        setNumber: 1,
        completedSet: makeCompletedSet({ reps: null }),
        loading: false,
        editable: false,
      },
      global: { stubs: { UIcon: true } },
    })
    const spans = wrapper.findAll('span')
    const repsSpan = spans[2]
    expect(repsSpan?.text()).toBe('—')
  })

  test('emits edit when clicked and editable', async () => {
    const wrapper = mount(ExtraSetRow, {
      props: {
        setNumber: 1,
        completedSet: makeCompletedSet(),
        loading: false,
        editable: true,
      },
      global: { stubs: { UIcon: true } },
    })
    await wrapper.find('div').trigger('click')
    expect(wrapper.emitted('edit')).toBeTruthy()
  })

  test('does not emit edit when not editable', async () => {
    const wrapper = mount(ExtraSetRow, {
      props: {
        setNumber: 1,
        completedSet: makeCompletedSet(),
        loading: false,
        editable: false,
      },
      global: { stubs: { UIcon: true } },
    })
    await wrapper.find('div').trigger('click')
    expect(wrapper.emitted('edit')).toBeFalsy()
  })

  test('applies opacity-50 class when loading', () => {
    const wrapper = mount(ExtraSetRow, {
      props: {
        setNumber: 1,
        completedSet: makeCompletedSet(),
        loading: true,
        editable: true,
      },
      global: { stubs: { UIcon: true } },
    })
    expect(wrapper.find('div').classes()).toContain('opacity-50')
  })

  test('does not apply opacity-50 when not loading', () => {
    const wrapper = mount(ExtraSetRow, {
      props: {
        setNumber: 1,
        completedSet: makeCompletedSet(),
        loading: false,
        editable: true,
      },
      global: { stubs: { UIcon: true } },
    })
    expect(wrapper.find('div').classes()).not.toContain('opacity-50')
  })
})
