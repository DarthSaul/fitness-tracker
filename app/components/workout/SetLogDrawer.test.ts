import { describe, test, expect, vi } from 'vitest'
import { ref, computed, watch, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import SetLogDrawer from './SetLogDrawer.vue'

// vitest.setup.ts stubs ref/computed for composable tests; restore real Vue
// reactivity so the component's setup() function runs correctly when mounted.
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('nextTick', nextTick)

const mockSet = {
  id: 's1',
  setNumber: 3,
  reps: 10,
  weight: 135,
  effortTarget: null,
  rpe: null,
  notes: null,
}

// Stub UDrawer: render #content slot and expose title/description as data attributes
// so tests can assert on the accessibility labels passed to the drawer.
const stubs = {
  UDrawer: { template: '<div :data-title="$attrs.title" :data-description="$attrs.description"><slot name="content" /></div>', inheritAttrs: false },
  UButton: { template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>', inheritAttrs: false },
  UIcon: true,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockExtraSet = {
  id: 'extra-s1',
  setNumber: null,
  reps: null,
  weight: null,
  effortTarget: null,
  rpe: null,
  notes: null,
} as any

describe('SetLogDrawer', () => {
  test('renders set number in visible heading', () => {
    const wrapper = mount(SetLogDrawer, {
      props: { set: mockSet, completedSet: null, open: true, loading: false },
      global: { stubs },
    })
    expect(wrapper.find('h3').text()).toContain('Set 3')
  })

  test('passes set number as accessible drawer title and description', () => {
    const wrapper = mount(SetLogDrawer, {
      props: { set: mockSet, completedSet: null, open: true, loading: false },
      global: { stubs },
    })
    const drawer = wrapper.find('[data-title]')
    expect(drawer.attributes('data-title')).toBe('Set 3')
    expect(drawer.attributes('data-description')).toContain('set 3')
  })

  test('renders "Extra Set" as title when set.setNumber is null', () => {
    const wrapper = mount(SetLogDrawer, {
      props: { set: mockExtraSet, completedSet: null, open: true, loading: false },
      global: { stubs },
    })
    expect(wrapper.find('h3').text()).toBe('Extra Set')
  })

  test('passes "extra set" as accessible drawer title and description when setNumber is null', () => {
    const wrapper = mount(SetLogDrawer, {
      props: { set: mockExtraSet, completedSet: null, open: true, loading: false },
      global: { stubs },
    })
    const drawer = wrapper.find('[data-title]')
    expect(drawer.attributes('data-title')).toBe('Extra Set')
    expect(drawer.attributes('data-description')).toContain('extra set')
  })

  test('pre-fills weight and reps as blank for extra sets with no completedSet', () => {
    const wrapper = mount(SetLogDrawer, {
      props: { set: mockExtraSet, completedSet: null, open: true, loading: false },
      global: { stubs },
    })
    const weightInput = wrapper.find<HTMLInputElement>('#drawer-weight')
    const repsInput = wrapper.find<HTMLInputElement>('#drawer-reps')
    // null editWeight/editReps renders as empty input
    expect(weightInput.element.value).toBe('')
    expect(repsInput.element.value).toBe('')
  })

  test('shows delete button when canDelete is true', () => {
    const wrapper = mount(SetLogDrawer, {
      props: { set: mockSet, completedSet: null, open: true, loading: false, canDelete: true },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('Delete Set')
  })

  test('does not show delete button when canDelete is false', () => {
    const wrapper = mount(SetLogDrawer, {
      props: { set: mockSet, completedSet: null, open: true, loading: false, canDelete: false },
      global: { stubs },
    })
    expect(wrapper.text()).not.toContain('Delete Set')
  })

  test('does not show delete button when canDelete is undefined', () => {
    const wrapper = mount(SetLogDrawer, {
      props: { set: mockSet, completedSet: null, open: true, loading: false },
      global: { stubs },
    })
    expect(wrapper.text()).not.toContain('Delete Set')
  })

  test('emits delete event when delete button is clicked', async () => {
    const wrapper = mount(SetLogDrawer, {
      props: { set: mockSet, completedSet: null, open: true, loading: false, canDelete: true },
      global: { stubs },
    })
    // UButton stub renders as a <button>; find the delete button by its text
    const buttons = wrapper.findAll('button')
    const deleteBtn = buttons.find(b => b.text() === 'Delete Set')
    expect(deleteBtn).toBeDefined()
    await deleteBtn!.trigger('click')
    expect(wrapper.emitted('delete')).toBeTruthy()
  })
})
