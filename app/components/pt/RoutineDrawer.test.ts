import { describe, test, expect, vi } from 'vitest'
import { ref, computed, watch, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import RoutineDrawer from './RoutineDrawer.vue'
import type { PtRoutine } from '~/types/pt-routine'

// vitest.setup.ts stubs ref/computed for composable tests; restore real Vue
// reactivity so the component's setup() function runs correctly when mounted.
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('nextTick', nextTick)

const stubs = {
  UDrawer: { template: '<div :data-title="$attrs.title" :data-description="$attrs.description"><slot name="content" /></div>', inheritAttrs: false },
  UButton: { template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>', inheritAttrs: false },
  UIcon: true,
}

function makeRoutine(id: string, name: string, exercises: Array<{ title: string; durationSeconds?: number; reps?: number }>): PtRoutine {
  return {
    id,
    name,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    exercises: exercises.map((exercise, index) => ({
      id: `${id}-ex${index}`,
      ptRoutineId: id,
      order: index + 1,
      title: exercise.title,
      durationSeconds: exercise.durationSeconds ?? null,
      reps: exercise.reps ?? null,
    })),
  }
}

const kneeRehab = makeRoutine('rt001', 'Knee Rehab', [
  { title: 'Clamshells', reps: 15 },
  { title: 'Wall sit', durationSeconds: 90 },
])
const shoulder = makeRoutine('rt002', 'Shoulder', [
  { title: 'Band pull-aparts', reps: 20 },
])

describe('PtRoutineDrawer', () => {
  test('renders numbered exercises with reps and duration formatting', () => {
    const wrapper = mount(RoutineDrawer, {
      props: { open: true, routines: [kneeRehab] },
      global: { stubs },
    })

    const rows = wrapper.findAll('li')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('1.')
    expect(rows[0]!.text()).toContain('Clamshells')
    expect(rows[0]!.text()).toContain('15 reps')
    expect(rows[1]!.text()).toContain('2.')
    expect(rows[1]!.text()).toContain('Wall sit')
    expect(rows[1]!.text()).toContain('90s')
  })

  test('shows the routine name without switcher pills for a single routine', () => {
    const wrapper = mount(RoutineDrawer, {
      props: { open: true, routines: [kneeRehab] },
      global: { stubs },
    })

    expect(wrapper.text()).toContain('Knee Rehab')
    expect(wrapper.findAll('[data-testid="routine-pill"]')).toHaveLength(0)
  })

  test('switcher pills change the displayed routine', async () => {
    const wrapper = mount(RoutineDrawer, {
      props: { open: true, routines: [kneeRehab, shoulder] },
      global: { stubs },
    })

    const pills = wrapper.findAll('[data-testid="routine-pill"]')
    expect(pills).toHaveLength(2)
    expect(wrapper.text()).toContain('Clamshells')

    await pills[1]!.trigger('click')

    expect(wrapper.text()).toContain('Band pull-aparts')
    expect(wrapper.text()).not.toContain('Clamshells')
  })

  test('emits update:open false when the close button is clicked', async () => {
    const wrapper = mount(RoutineDrawer, {
      props: { open: true, routines: [kneeRehab] },
      global: { stubs },
    })

    await wrapper.find('[aria-label="Close"]').trigger('click')

    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })
})
