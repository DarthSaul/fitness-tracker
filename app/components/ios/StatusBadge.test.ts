import { describe, test, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import StatusBadge from './StatusBadge.vue'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

describe('AppStatusBadge', () => {
  test('renders the label prop', () => {
    const wrapper = mount(StatusBadge, { props: { label: 'Active' } })

    expect(wrapper.text()).toBe('Active')
  })

  test('prefers slot content over the label prop', () => {
    const wrapper = mount(StatusBadge, { props: { label: 'Active' }, slots: { default: 'Beta' } })

    expect(wrapper.text()).toBe('Beta')
  })

  // The colour is semantic, not decorative: green = active/complete,
  // orange = in-progress/swapped/beta, red = destructive, gray = inert.
  test.each([
    ['green', 'text-ios-green'],
    ['orange', 'text-ios-orange'],
    ['red', 'text-ios-red'],
    ['tint', 'text-tint'],
    ['purple', 'text-ios-purple'],
    ['gray', 'text-label-secondary'],
  ])('maps the %s colour to its token classes', (color, expected) => {
    const wrapper = mount(StatusBadge, { props: { label: 'x', color: color as 'green' } })

    expect(wrapper.classes()).toContain(expected)
  })

  test('never shrinks inside a flex row', () => {
    const wrapper = mount(StatusBadge, { props: { label: 'In progress' } })

    expect(wrapper.classes()).toContain('shrink-0')
  })
})
