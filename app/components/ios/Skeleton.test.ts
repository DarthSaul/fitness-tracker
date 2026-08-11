import { describe, test, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import Skeleton from './Skeleton.vue'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

describe('AppSkeleton', () => {
  test('renders one block by default', () => {
    const wrapper = mount(Skeleton, { props: { height: 96 } })

    expect(wrapper.findAll('.animate-pulse')).toHaveLength(1)
  })

  test('renders one block per count for list placeholders', () => {
    const wrapper = mount(Skeleton, { props: { height: 56, count: 3 } })

    expect(wrapper.findAll('.animate-pulse')).toHaveLength(3)
  })

  test('treats bare numbers as px', () => {
    const wrapper = mount(Skeleton, { props: { height: 96, width: 200 } })

    expect(wrapper.find('.animate-pulse').attributes('style')).toContain('height: 96px')
    expect(wrapper.find('.animate-pulse').attributes('style')).toContain('width: 200px')
  })

  test('passes CSS lengths through untouched', () => {
    const wrapper = mount(Skeleton, { props: { height: '3rem', width: '100%' } })

    expect(wrapper.find('.animate-pulse').attributes('style')).toContain('height: 3rem')
    expect(wrapper.find('.animate-pulse').attributes('style')).toContain('width: 100%')
  })

  test('omits width when unset so the block fills its container', () => {
    const wrapper = mount(Skeleton, { props: { height: 96 } })

    expect(wrapper.find('.animate-pulse').attributes('style')).not.toContain('width')
  })

  test('applies the requested radius', () => {
    const wrapper = mount(Skeleton, { props: { height: 40, radius: 'full' } })

    expect(wrapper.find('.animate-pulse').classes()).toContain('rounded-full')
  })

  // Placeholders are noise to a screen reader — the surrounding region should
  // announce its own loading state instead.
  test('hides itself from assistive technology', () => {
    const wrapper = mount(Skeleton, { props: { height: 96 } })

    expect(wrapper.attributes('aria-hidden')).toBe('true')
  })
})
