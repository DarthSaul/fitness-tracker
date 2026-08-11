import { describe, test, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import StatTile from './StatTile.vue'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

const global = { stubs: { UIcon: true } }

describe('AppStatTile', () => {
  test('renders the value and label', () => {
    const wrapper = mount(StatTile, {
      props: { icon: 'i-lucide-calendar', value: '12.4k', label: 'lbs total' },
      global,
    })

    expect(wrapper.text()).toContain('12.4k')
    expect(wrapper.text()).toContain('lbs total')
  })

  // The three tiles sit side by side, so their digits must align.
  test('renders the value with tabular figures', () => {
    const wrapper = mount(StatTile, { props: { icon: 'i-lucide-calendar', value: '42' }, global })

    expect(wrapper.find('.tnum').text()).toBe('42')
  })

  test('truncates a long value rather than wrapping the tile', () => {
    const wrapper = mount(StatTile, { props: { icon: 'i-lucide-calendar', value: '1234567890' }, global })

    expect(wrapper.find('.tnum').classes()).toContain('truncate')
  })
})
