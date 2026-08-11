import { describe, test, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import ProgressRing from './ProgressRing.vue'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

/** The trim circle is the second of the two — the first is the track. */
function trimCircle(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('circle')[1]!
}

describe('AppProgressRing', () => {
  test('renders the done/total label', () => {
    const wrapper = mount(ProgressRing, { props: { value: 3, total: 24 } })

    expect(wrapper.text()).toBe('3/24')
  })

  test('labels itself for screen readers', () => {
    const wrapper = mount(ProgressRing, { props: { value: 3, total: 24 } })

    expect(wrapper.attributes('aria-label')).toBe('3 of 24 days complete')
  })

  test('leaves the trim fully offset at zero progress', () => {
    const wrapper = mount(ProgressRing, { props: { value: 0, total: 10 } })
    const circle = trimCircle(wrapper)

    expect(circle.attributes('stroke-dashoffset')).toBe(circle.attributes('stroke-dasharray'))
  })

  test('closes the trim completely at full progress', () => {
    const wrapper = mount(ProgressRing, { props: { value: 10, total: 10 } })

    expect(Number(trimCircle(wrapper).attributes('stroke-dashoffset'))).toBe(0)
  })

  test('halves the offset at half progress', () => {
    const wrapper = mount(ProgressRing, { props: { value: 5, total: 10 } })
    const circle = trimCircle(wrapper)
    const circumference = Number(circle.attributes('stroke-dasharray'))

    expect(Number(circle.attributes('stroke-dashoffset'))).toBeCloseTo(circumference / 2)
  })

  // A program with no days would otherwise divide by zero and emit NaN into
  // the SVG, which silently renders nothing.
  test('renders an empty ring rather than NaN when total is zero', () => {
    const wrapper = mount(ProgressRing, { props: { value: 0, total: 0 } })
    const circle = trimCircle(wrapper)

    expect(circle.attributes('stroke-dashoffset')).toBe(circle.attributes('stroke-dasharray'))
    expect(circle.attributes('stroke-dashoffset')).not.toContain('NaN')
  })

  test('clamps progress beyond the total', () => {
    const wrapper = mount(ProgressRing, { props: { value: 99, total: 10 } })

    expect(Number(trimCircle(wrapper).attributes('stroke-dashoffset'))).toBe(0)
  })

  test('derives the radius from size and stroke width', () => {
    const wrapper = mount(ProgressRing, { props: { value: 1, total: 2, size: 64, strokeWidth: 5 } })

    // (64 - 5) / 2 — inset by half the stroke so the ring is not clipped.
    expect(trimCircle(wrapper).attributes('r')).toBe('29.5')
  })
})
