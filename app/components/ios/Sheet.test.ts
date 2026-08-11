import { describe, test, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import Sheet from './Sheet.vue'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

/**
 * UDrawer portals its content, so stub it with a passthrough that renders the
 * #content slot inline. The stub also records the props we forward for
 * accessibility and detents.
 */
const UDrawerStub = {
  name: 'UDrawer',
  props: ['open', 'title', 'description', 'snapPoints', 'direction'],
  template: '<div class="drawer"><slot name="content" /></div>',
}

const global = { stubs: { UDrawer: UDrawerStub, UIcon: true } }

function mountSheet(props: Record<string, unknown> = {}) {
  return mount(Sheet, {
    props: { open: true, title: 'Log set', ...props },
    slots: { default: '<p>Body</p>' },
    global,
  })
}

describe('AppSheet', () => {
  // SetLogDrawer's existing test reads the title from an h3; keep the level.
  test('renders the title as an h3', () => {
    expect(mountSheet().find('h3').text()).toBe('Log set')
  })

  test('renders the default slot as the body', () => {
    expect(mountSheet().find('p').text()).toBe('Body')
  })

  test('closes when the close button is pressed', async () => {
    const wrapper = mountSheet()

    await wrapper.find('[aria-label="Close"]').trigger('click')

    expect(wrapper.emitted('update:open')).toEqual([[false]])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  // reka-ui warns and degrades without a labelled title/description, so both
  // must reach the drawer even though we render our own visible header.
  test('forwards title and description to the drawer for accessibility', () => {
    const wrapper = mountSheet({ description: 'Enter weight and reps' })
    const drawer = wrapper.findComponent(UDrawerStub)

    expect(drawer.props('title')).toBe('Log set')
    expect(drawer.props('description')).toBe('Enter weight and reps')
  })

  test('forwards detents as drawer snap points', () => {
    const wrapper = mountSheet({ detents: [0.52, 0.95] })

    expect(wrapper.findComponent(UDrawerStub).props('snapPoints')).toEqual([0.52, 0.95])
  })

  test('suppresses the built-in header when the body supplies its own', () => {
    const wrapper = mountSheet({ hideHeader: true })

    expect(wrapper.find('h3').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Close"]').exists()).toBe(false)
  })

  test('renders a footer slot below the body when given', () => {
    const wrapper = mount(Sheet, {
      props: { open: true, title: 'Log set' },
      slots: { default: '<p>Body</p>', footer: '<button>Save</button>' },
      global,
    })

    expect(wrapper.find('button:not([aria-label="Close"])').text()).toBe('Save')
  })
})
