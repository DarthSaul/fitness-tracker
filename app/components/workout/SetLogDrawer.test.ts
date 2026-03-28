import { ref, computed, watch, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import SetLogDrawer from '~/app/components/workout/SetLogDrawer.vue'

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
  notes: null,
}

// Stub UDrawer to render its #content slot so we can assert on the dialog internals.
// DialogTitle/DialogDescription require a DialogRoot context (provided by UDrawer at
// runtime) which is absent here — stub them as simple pass-through elements so the
// test can assert on the text content that is wired to each slot.
const stubs = {
  UDrawer: { template: '<div><slot name="content" /></div>' },
  UButton: true,
  UIcon: true,
  DialogTitle: { template: '<h3><slot /></h3>' },
  DialogDescription: { template: '<p><slot /></p>' },
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
})
