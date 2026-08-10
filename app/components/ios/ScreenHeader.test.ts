import { describe, test, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import ScreenHeader from './ScreenHeader.vue'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

describe('AppScreenHeader', () => {
  test('renders the title as the page heading', () => {
    const wrapper = mount(ScreenHeader, { props: { title: 'Analytics' } })

    expect(wrapper.find('h1').text()).toBe('Analytics')
  })

  // The emoji mirrors the tab icon and carries no information on its own.
  test('hides the emoji from screen readers', () => {
    const wrapper = mount(ScreenHeader, { props: { title: 'Home', emoji: '💪' } })

    const emoji = wrapper.find('[aria-hidden="true"]')
    expect(emoji.text()).toBe('💪')
  })

  test('omits the emoji element entirely when none is given', () => {
    const wrapper = mount(ScreenHeader, { props: { title: 'Home' } })

    expect(wrapper.find('[aria-hidden="true"]').exists()).toBe(false)
  })

  test('renders the subtitle beneath the title when given', () => {
    const wrapper = mount(ScreenHeader, { props: { title: 'History', subtitle: 'Completed workouts' } })

    expect(wrapper.find('p').text()).toBe('Completed workouts')
  })

  test('omits the subtitle element when none is given', () => {
    const wrapper = mount(ScreenHeader, { props: { title: 'History' } })

    expect(wrapper.find('p').exists()).toBe(false)
  })
})
