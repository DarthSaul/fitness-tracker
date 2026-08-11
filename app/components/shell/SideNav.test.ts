import { describe, test, expect, vi, afterEach } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import SideNav from './SideNav.vue'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

const NuxtLinkStub = {
  name: 'NuxtLink',
  props: { to: { type: String, required: true } },
  template: '<a :href="to"><slot /></a>',
}

const USER = { name: 'Saul Graves', email: 'graves.saul@example.com' }

function mountSideNav(options: {
  path?: string
  resumeTarget?: { to: string, subtitle: string } | null
  user?: { name?: string, email?: string } | null
} = {}) {
  const { path = '/', resumeTarget = null, user = USER } = options

  vi.stubGlobal('useRoute', () => ({ path }))
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appVersion: '1.4.2' } }))
  vi.stubGlobal('useAuth', () => ({ user: ref(user) }))

  return mount(SideNav, {
    props: { resumeTarget },
    global: {
      stubs: {
        UIcon: true,
        NuxtLink: NuxtLinkStub,
        // Rendered inline so its link counts toward the rail's own assertions.
        ShellResumeBanner: {
          props: ['to', 'subtitle', 'variant'],
          template: '<a class="resume" :href="to" :data-variant="variant">{{ subtitle }}</a>',
        },
      },
    },
  })
}

afterEach(() => {
  vi.stubGlobal('useRoute', vi.fn(() => ({ path: '/' })))
})

describe('ShellSideNav', () => {
  test('renders the five nav items, linked and labelled', () => {
    const items = mountSideNav().findAll('nav[aria-label="Primary"] a')

    expect(items.map(item => item.text())).toEqual([
      'Home',
      'History',
      'Analytics',
      'Programs',
      'Settings',
    ])
    expect(items.map(item => item.attributes('href'))).toEqual([
      '/',
      '/history',
      '/analytics',
      '/programs',
      '/settings',
    ])
  })

  describe('active state', () => {
    test('tints exactly one item and marks it as the current page', () => {
      const current = mountSideNav({ path: '/analytics' })
        .findAll('nav[aria-label="Primary"] a')
        .filter(item => item.attributes('aria-current') === 'page')

      expect(current).toHaveLength(1)
      expect(current[0]!.text()).toBe('Analytics')
      expect(current[0]!.classes()).toContain('text-tint')
    })

    test('an item stays active on its nested detail screens', () => {
      const current = mountSideNav({ path: '/history/abc' })
        .findAll('nav[aria-label="Primary"] a')
        .filter(item => item.attributes('aria-current') === 'page')

      expect(current.map(item => item.text())).toEqual(['History'])
    })

    // Matches the tab bar: these screens belong to no tab, deliberately.
    test('nothing is active on a screen that belongs to no nav item', () => {
      const current = mountSideNav({ path: '/program' })
        .findAll('nav[aria-label="Primary"] a')
        .filter(item => item.attributes('aria-current') === 'page')

      expect(current).toHaveLength(0)
    })
  })

  describe('identity row', () => {
    test('shows the signed-in user and links to settings', () => {
      const wrapper = mountSideNav()
      const account = wrapper.find('[aria-label="Account settings"]')

      expect(account.attributes('href')).toBe('/settings')
      expect(account.text()).toContain('Saul Graves')
      expect(account.text()).toContain('graves.saul@example.com')
    })

    test('shows the initial of the user name', () => {
      expect(mountSideNav().find('[aria-label="Account settings"]').text()).toContain('S')
    })

    // The rail renders before the session resolves on a cold load.
    test('degrades when there is no user yet', () => {
      const account = mountSideNav({ user: null }).find('[aria-label="Account settings"]')

      expect(account.text()).toContain('Unknown')
      expect(account.text()).toContain('?')
    })
  })

  test('shows the app version', () => {
    expect(mountSideNav().text()).toContain('v1.4.2')
  })

  describe('resume banner', () => {
    test('is absent when no session is open', () => {
      expect(mountSideNav().find('.resume').exists()).toBe(false)
    })

    test('renders in the rail as an inline card when a session is open', () => {
      const resume = mountSideNav({
        resumeTarget: { to: '/workout/abc', subtitle: 'Week 2 · Day 3' },
      }).find('.resume')

      expect(resume.attributes('href')).toBe('/workout/abc')
      expect(resume.attributes('data-variant')).toBe('inline')
      expect(resume.text()).toBe('Week 2 · Day 3')
    })
  })
})
