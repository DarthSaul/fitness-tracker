import { describe, test, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import Card from './Card.vue'

// vitest.setup.ts stubs ref/computed for composable tests; restore real Vue
// reactivity so the component's setup() function runs correctly when mounted.
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

describe('AppCard', () => {
  test('renders no rail by default', () => {
    const wrapper = mount(Card, { slots: { default: 'Body' } })

    expect(wrapper.text()).toBe('Body')
    expect(wrapper.element.children).toHaveLength(1)
  })

  test.each([
    ['brand', 'from-ios-purple'],
    ['completed', 'from-ios-green'],
    ['muted', 'from-ios-gray'],
  ])('renders the %s rail as the leading child', (rail, expectedClass) => {
    const wrapper = mount(Card, { props: { rail: rail as 'brand' } })

    const railEl = wrapper.element.children[0] as HTMLElement
    expect(railEl.className).toContain(expectedClass)
    expect(railEl.className).toContain('w-2')
  })

  // The rail must run the full height, so the minimum height belongs to the
  // content column rather than the card itself.
  test('applies minHeight to the content column, not the card', () => {
    const wrapper = mount(Card, { props: { rail: 'brand', minHeight: 180 } })

    expect(wrapper.attributes('style')).toBeUndefined()
    expect((wrapper.element.lastElementChild as HTMLElement).style.minHeight).toBe('180px')
  })

  test('drops the padding when padded=false', () => {
    const wrapper = mount(Card, { props: { padded: false } })

    expect((wrapper.element.lastElementChild as HTMLElement).className).not.toContain('p-4')
  })
})
