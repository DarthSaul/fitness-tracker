import { describe, test, expect, vi } from 'vitest'
import { ref, computed, watch, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import WorkoutPreviewDrawer from './WorkoutPreviewDrawer.vue'

// Restore real Vue reactivity (vitest.setup.ts stubs these for composable tests)
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('nextTick', nextTick)

const stubs = {
  UDrawer: { template: '<div><slot name="content" /></div>' },
  UIcon: true,
}

function makeSet(overrides: Partial<{
  id: string; setNumber: number; reps: number | null; weight: number | null;
  rpe: number | null; notes: string | null; effortTarget: string | null
}> = {}) {
  return { id: 's1', setNumber: 1, reps: null, weight: null, rpe: null, notes: null, effortTarget: null, ...overrides }
}

function makeStandardDay(sets = [makeSet({ reps: 5, weight: 185 })]) {
  return {
    id: 'd1',
    dayNumber: 2,
    name: 'Back & Biceps',
    warmUp: '5 min treadmill',
    exerciseGroups: [{
      id: 'g1',
      type: 'STANDARD' as const,
      restSeconds: 90,
      exercises: [{
        id: 'pe1',
        order: 1,
        exercise: { id: 'e1', name: 'Deadlift' },
        sets,
      }],
    }],
  }
}

const supersetDay = {
  id: 'd2',
  dayNumber: 3,
  name: null,
  warmUp: null,
  exerciseGroups: [{
    id: 'g2',
    type: 'SUPERSET' as const,
    restSeconds: 60,
    exercises: [
      { id: 'pe2', order: 1, exercise: { id: 'e2', name: 'Bicep Curls' }, sets: [makeSet({ setNumber: 1, reps: 10, weight: 35 })] },
      { id: 'pe3', order: 2, exercise: { id: 'e3', name: 'Tricep Extensions' }, sets: [makeSet({ setNumber: 1, reps: 10, weight: 40 })] },
    ],
  }],
}

const baseProps = { open: true, weekNumber: 3, dayNumber: 2 }

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
describe('header', () => {
  test('renders week and day number', () => {
    const wrapper = mount(WorkoutPreviewDrawer, {
      props: { ...baseProps, day: makeStandardDay() },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('Week 3')
    expect(wrapper.text()).toContain('Day 2')
  })

  test('renders "Preview" label', () => {
    const wrapper = mount(WorkoutPreviewDrawer, {
      props: { ...baseProps, day: makeStandardDay() },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('Preview')
  })

  test('emits close when close button is clicked', async () => {
    const wrapper = mount(WorkoutPreviewDrawer, {
      props: { ...baseProps, day: makeStandardDay() },
      global: { stubs },
    })
    await wrapper.find('button[aria-label="Close preview"]').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Warm-up
// ---------------------------------------------------------------------------
describe('warm-up', () => {
  test('shows warm-up text when present', () => {
    const wrapper = mount(WorkoutPreviewDrawer, {
      props: { ...baseProps, day: makeStandardDay() },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('5 min treadmill')
  })

  test('hides warm-up section when warmUp is null', () => {
    const wrapper = mount(WorkoutPreviewDrawer, {
      props: { ...baseProps, day: supersetDay },
      global: { stubs },
    })
    expect(wrapper.text()).not.toContain('Warm-up')
  })
})

// ---------------------------------------------------------------------------
// describeSet — rendered via set list items
// ---------------------------------------------------------------------------
describe('describeSet', () => {
  function mountWithSet(overrides: Parameters<typeof makeSet>[0]) {
    return mount(WorkoutPreviewDrawer, {
      props: { ...baseProps, day: makeStandardDay([makeSet(overrides)]) },
      global: { stubs },
    })
  }

  test('shows reps alone', () => {
    expect(mountWithSet({ reps: 8 }).text()).toContain('8 reps')
  })

  test('shows reps and weight', () => {
    const text = mountWithSet({ reps: 8, weight: 135 }).text()
    expect(text).toContain('8 reps')
    expect(text).toContain('@ 135 lbs')
  })

  test('shows reps and RPE', () => {
    const text = mountWithSet({ reps: 8, rpe: 8 }).text()
    expect(text).toContain('8 reps')
    expect(text).toContain('RPE 8')
  })

  test('shows effortTarget alone when no reps', () => {
    expect(mountWithSet({ effortTarget: 'AMRAP' }).text()).toContain('AMRAP')
  })

  test('shows reps alongside effortTarget', () => {
    const text = mountWithSet({ reps: 5, effortTarget: 'Build to heavy' }).text()
    expect(text).toContain('5 reps')
    expect(text).toContain('Build to heavy')
  })

  test('shows — when all fields are null', () => {
    expect(mountWithSet({}).text()).toContain('—')
  })

  test('shows notes when present', () => {
    expect(mountWithSet({ reps: 8, notes: 'full ROM' }).text()).toContain('full ROM')
  })
})

// ---------------------------------------------------------------------------
// formatRest — rendered via rest label
// ---------------------------------------------------------------------------
describe('formatRest', () => {
  function mountWithRest(restSeconds: number | null) {
    const base = makeStandardDay()
    const day = {
      ...base,
      exerciseGroups: [{ id: 'g1', type: 'STANDARD' as const, exercises: base.exerciseGroups[0]!.exercises, restSeconds }],
    }
    return mount(WorkoutPreviewDrawer, {
      props: { ...baseProps, day },
      global: { stubs },
    })
  }

  test('formats seconds under 60', () => {
    expect(mountWithRest(45).text()).toContain('45s rest')
  })

  test('formats exactly 60s as 1m rest', () => {
    expect(mountWithRest(60).text()).toContain('1m rest')
  })

  test('formats 90s as 1m 30s rest', () => {
    expect(mountWithRest(90).text()).toContain('1m 30s rest')
  })

  test('renders rest when restSeconds is 0', () => {
    expect(mountWithRest(0).text()).toContain('0s rest')
  })

  test('hides rest section when restSeconds is null', () => {
    expect(mountWithRest(null).text()).not.toContain('rest')
  })
})

// ---------------------------------------------------------------------------
// STANDARD vs SUPERSET layout
// ---------------------------------------------------------------------------
describe('exercise group layouts', () => {
  test('STANDARD: shows numbered exercise name', () => {
    const wrapper = mount(WorkoutPreviewDrawer, {
      props: { ...baseProps, day: makeStandardDay() },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('1. Deadlift')
  })

  test('SUPERSET: shows numbered "Superset" header', () => {
    const wrapper = mount(WorkoutPreviewDrawer, {
      props: { ...baseProps, day: supersetDay },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('1. Superset')
  })

  test('SUPERSET: renders both exercise names without a/b prefixes', () => {
    const wrapper = mount(WorkoutPreviewDrawer, {
      props: { ...baseProps, day: supersetDay },
      global: { stubs },
    })
    const text = wrapper.text()
    expect(text).toContain('Bicep Curls')
    expect(text).toContain('Tricep Extensions')
    expect(text).not.toContain('1a.')
    expect(text).not.toContain('1b.')
  })

  test('SUPERSET: renders exercises in a two-column grid', () => {
    const wrapper = mount(WorkoutPreviewDrawer, {
      props: { ...baseProps, day: supersetDay },
      global: { stubs },
    })
    expect(wrapper.find('.grid.grid-cols-2').exists()).toBe(true)
  })

  test('STANDARD: does not render a two-column grid', () => {
    const wrapper = mount(WorkoutPreviewDrawer, {
      props: { ...baseProps, day: makeStandardDay() },
      global: { stubs },
    })
    expect(wrapper.find('.grid.grid-cols-2').exists()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Empty / null day
// ---------------------------------------------------------------------------
describe('empty state', () => {
  test('shows fallback message when day is null', () => {
    const wrapper = mount(WorkoutPreviewDrawer, {
      props: { ...baseProps, day: null },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('No workout data available')
  })
})
