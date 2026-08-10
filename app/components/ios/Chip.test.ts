import { describe, test, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import Chip from './Chip.vue'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

const global = { stubs: { UIcon: true } }

describe('AppChip', () => {
  test('renders inert as a span by default', () => {
    const wrapper = mount(Chip, { props: { label: 'Rest 90s' }, global })

    expect(wrapper.element.tagName).toBe('SPAN')
    expect(wrapper.text()).toBe('Rest 90s')
  })

  test('renders as a typed button when tappable', () => {
    const wrapper = mount(Chip, { props: { label: 'Trend', as: 'button' }, global })

    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('type')).toBe('button')
  })

  test('emits click only when rendered as a button', async () => {
    const button = mount(Chip, { props: { label: 'Swap', as: 'button' }, global })
    await button.trigger('click')
    expect(button.emitted('click')).toHaveLength(1)

    const span = mount(Chip, { props: { label: 'Rest 90s' }, global })
    await span.trigger('click')
    expect(span.emitted('click')).toBeFalsy()
  })

  test('renders the icon when one is given', () => {
    const withIcon = mount(Chip, { props: { label: 'Rest', icon: 'i-lucide-clock' }, global })
    expect(withIcon.findComponent({ name: 'UIcon' }).exists()).toBe(true)

    const withoutIcon = mount(Chip, { props: { label: 'Rest' }, global })
    expect(withoutIcon.findComponent({ name: 'UIcon' }).exists()).toBe(false)
  })
})
