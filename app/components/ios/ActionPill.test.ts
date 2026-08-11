import { describe, test, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, RouterLink } from 'vue-router'
import ActionPill from './ActionPill.vue'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

const global = { stubs: { UIcon: true, NuxtLink: { template: '<a><slot /></a>' } } }

type PillProps = InstanceType<typeof ActionPill>['$props']

/**
 * Mounts against a real router with `NuxtLink` resolved to `RouterLink` — the
 * component NuxtLink delegates to for internal links, and the one that owns
 * the click handler that actually navigates. An `<a>` stub would report a
 * passing test no matter what the pill's own handler does.
 */
async function mountWithRouter(props: PillProps) {
  const blank = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: blank },
      { path: '/workout/1', component: blank },
    ],
  })
  await router.push('/')
  await router.isReady()

  const wrapper = mount(ActionPill, {
    props,
    global: { plugins: [router], stubs: { UIcon: true }, components: { NuxtLink: RouterLink } },
  })

  return { wrapper, router }
}

describe('AppActionPill', () => {
  test('renders a button and emits click', async () => {
    const wrapper = mount(ActionPill, { props: { label: 'Start next workout' }, global })

    expect(wrapper.find('button').exists()).toBe(true)
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  test('renders a link instead of a button when `to` is set', () => {
    const wrapper = mount(ActionPill, { props: { label: 'Resume workout', to: '/workout/1' }, global })

    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.find('a').exists()).toBe(true)
  })

  test.each([
    ['green', 'text-ios-green bg-ios-green/15'],
    ['tint', 'text-tint bg-tint/15'],
    ['secondary', 'text-label-secondary bg-label-secondary/15'],
    ['red', 'text-ios-red bg-ios-red/15'],
  ])('applies the %s tint', (tint, expected) => {
    const wrapper = mount(ActionPill, { props: { label: 'x', tint: tint as 'green' }, global })

    for (const cls of expected.split(' ')) {
      expect(wrapper.find('button').classes()).toContain(cls)
    }
  })

  test('does not emit click while loading', async () => {
    const wrapper = mount(ActionPill, { props: { label: 'x', loading: true }, global })

    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('click')).toBeFalsy()
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  test('does not emit click while disabled', async () => {
    const wrapper = mount(ActionPill, { props: { label: 'x', disabled: true }, global })

    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('click')).toBeFalsy()
  })

  // A link has no `disabled` attribute, and `pointer-events-none` still leaves
  // it reachable by keyboard — so it has to be blocked explicitly.
  describe.each<[string, PillProps]>([
    ['disabled', { label: 'x', to: '/workout/1', disabled: true }],
    ['loading', { label: 'x', to: '/workout/1', loading: true }],
  ])('link with %s set', (_flag, props) => {
    test('leaves the route unchanged on click', async () => {
      const { wrapper, router } = await mountWithRouter(props)

      await wrapper.find('a').trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.fullPath).toBe('/')
    })

    test('is removed from the tab order and announced as disabled', () => {
      const wrapper = mount(ActionPill, { props, global })
      const link = wrapper.find('a')

      expect(link.attributes('tabindex')).toBe('-1')
      expect(link.attributes('aria-disabled')).toBe('true')
    })
  })

  test('an enabled link navigates normally', async () => {
    const { wrapper, router } = await mountWithRouter({ label: 'x', to: '/workout/1' })
    const link = wrapper.find('a')

    expect(link.attributes('tabindex')).toBeUndefined()
    expect(link.attributes('aria-disabled')).toBeUndefined()

    await link.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/workout/1')
  })
})
