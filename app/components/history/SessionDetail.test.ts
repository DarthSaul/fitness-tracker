import { describe, test, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import SessionDetail from './SessionDetail.vue'
import type { DetailLoggedSet } from './SessionDetail.vue'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

const groups = [
  {
    id: 'g1',
    type: 'STANDARD' as const,
    restSeconds: 90,
    exercises: [
      {
        id: 'pe1',
        name: 'Bench Press',
        sets: [
          { id: 'set1', setNumber: 1, reps: 10, weight: 135 },
          { id: 'set2', setNumber: 2, reps: 10, weight: 135 },
        ],
      },
    ],
  },
]

function mountDetail(logged: DetailLoggedSet[]) {
  return mount(SessionDetail, {
    props: { completedAt: '2026-01-15T10:00:00.000Z', groups, logged },
    global: { stubs: { UIcon: true } },
  })
}

describe('HistorySessionDetail', () => {
  test('shows the logged value against its prescribed set', () => {
    const wrapper = mountDetail([
      { setId: 'set1', exerciseId: 'pe1', exerciseName: null, reps: 10, weight: 135 },
    ])

    expect(wrapper.text()).toContain('10 reps · 135 lb')
  })

  test('marks an unlogged prescribed set as skipped', () => {
    const wrapper = mountDetail([])

    expect(wrapper.text()).toContain('Skipped')
  })

  test('renders extra sets under their exercise', () => {
    const wrapper = mountDetail([
      { setId: null, exerciseId: 'pe1', exerciseName: null, reps: 8, weight: 145 },
    ])

    expect(wrapper.text()).toContain('Extra 1')
    expect(wrapper.text()).toContain('8 reps · 145 lb')
  })

  test('groups genuinely ad-hoc sets by exercise name', () => {
    const wrapper = mountDetail([
      { setId: null, exerciseId: null, exerciseName: 'Plank', reps: null, weight: null },
    ])

    expect(wrapper.text()).toContain('Plank')
  })

  // A set logged against an exercise that has since left the template has an
  // exerciseId with no matching card, so neither the exercise loop nor the
  // old name-only ad-hoc filter would render it — the set vanished silently.
  test('still renders a set whose exerciseId is no longer in the template', () => {
    const wrapper = mountDetail([
      { setId: null, exerciseId: 'removed-pe', exerciseName: 'Overhead Press', reps: 5, weight: 95 },
    ])

    expect(wrapper.text()).toContain('Overhead Press')
    expect(wrapper.text()).toContain('5 reps · 95 lb')
  })

  test('falls back to a placeholder name when the orphaned set has none', () => {
    const wrapper = mountDetail([
      { setId: null, exerciseId: 'removed-pe', exerciseName: null, reps: 5, weight: 95 },
    ])

    expect(wrapper.text()).toContain('Unlisted exercise')
    expect(wrapper.text()).toContain('5 reps · 95 lb')
  })
})
