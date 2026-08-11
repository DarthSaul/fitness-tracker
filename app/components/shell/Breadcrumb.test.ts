import { describe, test, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import Breadcrumb from './Breadcrumb.vue'
import type { Crumb } from '../../composables/useBreadcrumbs'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

const NuxtLinkStub = {
  name: 'NuxtLink',
  props: { to: { type: String, required: true } },
  template: '<a :href="to"><slot /></a>',
}

function mountBreadcrumb(items: Crumb[]) {
  return mount(Breadcrumb, {
    props: { items },
    global: { stubs: { UIcon: true, NuxtLink: NuxtLinkStub } },
  })
}

const TRAIL: Crumb[] = [
  { label: 'Home', to: '/' },
  { label: 'Manage Program', to: '/program' },
  { label: 'Log Workout' },
]

describe('ShellBreadcrumb', () => {
  test('is a labelled nav wrapping an ordered list', () => {
    const wrapper = mountBreadcrumb(TRAIL)

    expect(wrapper.find('nav').attributes('aria-label')).toBe('Breadcrumb')
    expect(wrapper.find('nav > ol').exists()).toBe(true)
    expect(wrapper.findAll('li')).toHaveLength(3)
  })

  test('renders ancestors as links', () => {
    const links = mountBreadcrumb(TRAIL).findAll('a')

    expect(links).toHaveLength(2)
    expect(links.map(link => link.text())).toEqual(['Home', 'Manage Program'])
    expect(links.map(link => link.attributes('href'))).toEqual(['/', '/program'])
  })

  // The leaf is the page you are already on — a link to it would be a no-op.
  test('renders the leaf as plain text marked as the current page', () => {
    const wrapper = mountBreadcrumb(TRAIL)
    const leaf = wrapper.find('[aria-current="page"]')

    expect(leaf.text()).toBe('Log Workout')
    expect(leaf.element.tagName).toBe('SPAN')
    expect(wrapper.findAll('[aria-current="page"]')).toHaveLength(1)
  })

  test('puts a separator between crumbs but not after the last', () => {
    expect(mountBreadcrumb(TRAIL).findAll('[name="i-lucide-chevron-right"]')).toHaveLength(2)
  })

  test('a single-parent trail renders one link and one separator', () => {
    const wrapper = mountBreadcrumb([{ label: 'History', to: '/history' }, { label: 'Wed Jan 15' }])

    expect(wrapper.findAll('a')).toHaveLength(1)
    expect(wrapper.findAll('[name="i-lucide-chevron-right"]')).toHaveLength(1)
    expect(wrapper.find('[aria-current="page"]').text()).toBe('Wed Jan 15')
  })

  test('renders nothing for an empty trail', () => {
    expect(mountBreadcrumb([]).findAll('li')).toHaveLength(0)
  })
})
