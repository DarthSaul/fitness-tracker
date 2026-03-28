import { ref, computed, watch, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import SetRow from '~/app/components/workout/SetRow.vue'

// vitest.setup.ts stubs ref/computed for composable tests; restore real Vue
// reactivity so the component's setup() function runs correctly when mounted.
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('nextTick', nextTick)

const mockSet = {
  id: 's1',
  setNumber: 1,
  reps: 10,
  weight: 135,
  effortTarget: null,
  notes: null,
}

describe('SetRow', () => {
  test('does not emit edit when editable=false', async () => {
    const wrapper = mount(SetRow, {
      props: { set: mockSet, completedSet: null, loading: false, editable: false },
      global: { stubs: { UIcon: true } },
    })
    await wrapper.find('[data-testid="set-row"]').trigger('click')
    expect(wrapper.emitted('edit')).toBeFalsy()
  })

  test('emits edit when editable=true', async () => {
    const wrapper = mount(SetRow, {
      props: { set: mockSet, completedSet: null, loading: false, editable: true },
      global: { stubs: { UIcon: true } },
    })
    await wrapper.find('[data-testid="set-row"]').trigger('click')
    expect(wrapper.emitted('edit')).toBeTruthy()
  })
})
