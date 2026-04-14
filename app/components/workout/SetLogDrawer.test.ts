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

// Stub UDrawer to render its #content slot so we can assert on the dialog internals.
// DialogTitle/DialogDescription require a DialogRoot context (provided by UDrawer at
// runtime) which is absent here — stub them as simple pass-through elements so the
// test can assert on the text content that is wired to each slot.
// UButton renders its default slot so button text content is visible in wrapper.text().
const stubs = {
  UDrawer: { template: '<div><slot name="content" /></div>' },
  UButton: { template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>', inheritAttrs: false },
  UIcon: true,
  DialogTitle: { template: '<h3><slot /></h3>' },
  DialogDescription: { template: '<p><slot /></p>' },
}

const mockExtraSet = {
  id: 'extra-s1',
  setNumber: null,
  reps: null,
  weight: null,
  effortTarget: null,
  rpe: null,
  notes: null,
}

describe('SetLogDrawer', () => {
  test('renders DialogTitle with the set number', () => {
    const wrapper = mount(SetLogDrawer, {
      props: { set: mockSet, completedSet: null, open: true, loading: false },
      global: { stubs },
    })
    expect(wrapper.find('h3').text()).toContain('Set 3')
  })

  test('renders DialogDescription text with the set number', () => {
    const wrapper = mount(SetLogDrawer, {
      props: { set: mockSet, completedSet: null, open: true, loading: false },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('Enter weight and reps for set 3')
  })

  test('renders "Extra Set" as title when set.setNumber is null', () => {
    const wrapper = mount(SetLogDrawer, {
      props: { set: mockExtraSet, completedSet: null, open: true, loading: false },
      global: { stubs },
    })
    expect(wrapper.find('h3').text()).toBe('Extra Set')
  })

  test('renders extra set description when set.setNumber is null', () => {
    const wrapper = mount(SetLogDrawer, {
      props: { set: mockExtraSet, completedSet: null, open: true, loading: false },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('Enter weight and reps for extra set')
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
