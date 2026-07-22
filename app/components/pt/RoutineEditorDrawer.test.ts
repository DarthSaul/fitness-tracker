import { describe, test, expect, vi } from 'vitest'
import { ref, computed, watch, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import RoutineEditorDrawer from './RoutineEditorDrawer.vue'
import type { PtRoutine } from '~/types/pt-routine'

// vitest.setup.ts stubs ref/computed for composable tests; restore real Vue
// reactivity so the component's setup() function runs correctly when mounted.
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('nextTick', nextTick)

const stubs = {
  UDrawer: { template: '<div :data-title="$attrs.title" :data-description="$attrs.description"><slot name="content" /></div>', inheritAttrs: false },
  UButton: { template: '<button v-bind="$attrs" :disabled="$attrs.disabled" @click="$emit(\'click\')"><slot /></button>', inheritAttrs: false },
  UIcon: true,
}

const mockRoutine: PtRoutine = {
  id: 'rt001',
  name: 'Knee Rehab',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  exercises: [
    { id: 'rtex001', ptRoutineId: 'rt001', order: 1, title: 'Clamshells', durationSeconds: null, reps: 15 },
    { id: 'rtex002', ptRoutineId: 'rt001', order: 2, title: 'Wall sit', durationSeconds: 90, reps: null },
  ],
}

function mountEditor(routine: PtRoutine | null = null) {
  return mount(RoutineEditorDrawer, {
    props: { open: true, routine, saving: false },
    global: { stubs },
  })
}

function titleInputs(wrapper: ReturnType<typeof mountEditor>) {
  return wrapper.findAll('input[data-testid="exercise-title"]')
}

describe('PtRoutineEditorDrawer', () => {
  test('create mode renders heading and a single blank exercise row', () => {
    const wrapper = mountEditor()

    expect(wrapper.find('h3').text()).toBe('New PT Routine')
    expect(titleInputs(wrapper)).toHaveLength(1)
    expect((titleInputs(wrapper)[0]!.element as HTMLInputElement).value).toBe('')
  })

  test('edit mode prefills name and exercise rows from the routine', () => {
    const wrapper = mountEditor(mockRoutine)

    expect(wrapper.find('h3').text()).toBe('Edit PT Routine')
    expect((wrapper.find('input[data-testid="routine-name"]').element as HTMLInputElement).value).toBe('Knee Rehab')
    const titles = titleInputs(wrapper)
    expect(titles).toHaveLength(2)
    expect((titles[0]!.element as HTMLInputElement).value).toBe('Clamshells')
    expect((titles[1]!.element as HTMLInputElement).value).toBe('Wall sit')
  })

  test('add exercise appends a blank row', async () => {
    const wrapper = mountEditor(mockRoutine)

    await wrapper.find('[data-testid="add-exercise"]').trigger('click')

    expect(titleInputs(wrapper)).toHaveLength(3)
  })

  test('remove deletes the row', async () => {
    const wrapper = mountEditor(mockRoutine)

    await wrapper.findAll('[aria-label="Remove exercise"]')[0]!.trigger('click')

    const titles = titleInputs(wrapper)
    expect(titles).toHaveLength(1)
    expect((titles[0]!.element as HTMLInputElement).value).toBe('Wall sit')
  })

  test('move down reorders the rows', async () => {
    const wrapper = mountEditor(mockRoutine)

    await wrapper.findAll('[aria-label="Move down"]')[0]!.trigger('click')

    const titles = titleInputs(wrapper)
    expect((titles[0]!.element as HTMLInputElement).value).toBe('Wall sit')
    expect((titles[1]!.element as HTMLInputElement).value).toBe('Clamshells')
  })

  test('save is disabled while a row is incomplete', async () => {
    const wrapper = mountEditor()

    await wrapper.find('input[data-testid="routine-name"]').setValue('Knee Rehab')
    const save = wrapper.find('[data-testid="save-routine"]')
    expect(save.attributes('disabled')).toBeDefined()

    await titleInputs(wrapper)[0]!.setValue('Clamshells')
    await wrapper.find('input[data-testid="exercise-value"]').setValue('15')

    expect(wrapper.find('[data-testid="save-routine"]').attributes('disabled')).toBeUndefined()
  })

  test('emits save with the draft converted to exercise inputs', async () => {
    const wrapper = mountEditor(mockRoutine)

    await wrapper.find('input[data-testid="routine-name"]').setValue('  Hip Rehab  ')
    await wrapper.find('[data-testid="save-routine"]').trigger('click')

    // The UButton stub re-emits click on top of the bound listener, so assert
    // on the first save emission rather than the full array
    expect(wrapper.emitted('save')![0]).toEqual([{
      name: 'Hip Rehab',
      exercises: [
        { title: 'Clamshells', durationSeconds: null, reps: 15 },
        { title: 'Wall sit', durationSeconds: 90, reps: null },
      ],
    }])
  })

  test('switching a row measure resets its value and save payload uses the new measure', async () => {
    const wrapper = mountEditor(mockRoutine)

    // Switch the first row (reps: 15) to a duration measure
    await wrapper.findAll('[data-testid="measure-duration"]')[0]!.trigger('click')
    const save = wrapper.find('[data-testid="save-routine"]')
    expect(save.attributes('disabled')).toBeDefined()

    await wrapper.findAll('input[data-testid="exercise-value"]')[0]!.setValue('60')
    await save.trigger('click')

    expect(wrapper.emitted('save')![0]).toEqual([{
      name: 'Knee Rehab',
      exercises: [
        { title: 'Clamshells', durationSeconds: 60, reps: null },
        { title: 'Wall sit', durationSeconds: 90, reps: null },
      ],
    }])
  })
})
