/**
 * Tests for app/pages/settings.vue — the delete-account flow.
 *
 * Deletion is irreversible, so the flow must be: an explicit row press opens a
 * confirmation sheet, and only the sheet's destructive button calls the API.
 * A failure surfaces an error and leaves the user signed in on the page.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('definePageMeta', vi.fn())

const deleteAccount = vi.fn()
const signOut = vi.fn()
vi.stubGlobal('useAuth', () => ({
  user: ref({ id: 'u1', email: 'a@b.com', name: 'Alice', avatarUrl: null }),
  signOut,
  deleteAccount,
}))
vi.stubGlobal('usePtRoutineSetting', () => ({
  enabled: ref(false),
  saving: ref(false),
  status: ref('success'),
  setEnabled: vi.fn(),
}))
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appVersion: '1.4.2' } }))

const UButtonStub = {
  name: 'UButton',
  props: ['label', 'loading', 'disabled', 'color', 'variant', 'size', 'block', 'icon'],
  emits: ['click'],
  template: '<button type="button" :disabled="disabled || loading" @click="$emit(\'click\')"><slot>{{ label }}</slot></button>',
}

const UAlertStub = {
  name: 'UAlert',
  props: ['title', 'description', 'color', 'variant', 'icon'],
  template: '<div class="alert">{{ title }}</div>',
}

const AppSheetStub = {
  name: 'AppSheet',
  props: ['open', 'title', 'description', 'detents', 'hideHeader'],
  emits: ['update:open', 'close'],
  template: '<div v-if="open" class="sheet" :data-title="title"><slot /><slot name="footer" /></div>',
}

async function mountSettings(): Promise<VueWrapper> {
  const Settings = (await import('./settings.vue')).default
  return mount(Settings, {
    global: {
      stubs: {
        UButton: UButtonStub,
        UAlert: UAlertStub,
        AppSheet: AppSheetStub,
        UIcon: true,
        USwitch: true,
        UColorModeSelect: true,
        AppSkeleton: true,
        NuxtLink: { template: '<a><slot /></a>' },
      },
    },
  })
}

function findButton(wrapper: VueWrapper, text: string) {
  const button = wrapper.findAll('button').find(b => b.text().includes(text))
  expect(button, `expected a button containing "${text}"`).toBeDefined()
  return button!
}

describe('settings page — delete account', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deleteAccount.mockResolvedValue(undefined)
  })

  test('shows a Delete Account row but no confirmation sheet initially', async () => {
    const wrapper = await mountSettings()

    expect(wrapper.text()).toContain('Delete Account')
    expect(wrapper.find('.sheet').exists()).toBe(false)
    expect(deleteAccount).not.toHaveBeenCalled()
  })

  test('pressing the row opens the confirmation sheet without deleting', async () => {
    const wrapper = await mountSettings()

    await findButton(wrapper, 'Delete Account').trigger('click')

    const sheet = wrapper.find('.sheet')
    expect(sheet.exists()).toBe(true)
    expect(sheet.text()).toContain('cannot be undone')
    expect(deleteAccount).not.toHaveBeenCalled()
  })

  test('confirming in the sheet calls deleteAccount', async () => {
    const wrapper = await mountSettings()

    await findButton(wrapper, 'Delete Account').trigger('click')
    await findButton(wrapper, 'Delete My Account').trigger('click')

    expect(deleteAccount).toHaveBeenCalledOnce()
  })

  test('cancel closes the sheet without deleting', async () => {
    const wrapper = await mountSettings()

    await findButton(wrapper, 'Delete Account').trigger('click')
    await findButton(wrapper, 'Cancel').trigger('click')

    expect(wrapper.find('.sheet').exists()).toBe(false)
    expect(deleteAccount).not.toHaveBeenCalled()
  })

  test('a failed deletion surfaces an error inside the sheet', async () => {
    deleteAccount.mockRejectedValueOnce(new Error('server error'))
    const wrapper = await mountSettings()

    await findButton(wrapper, 'Delete Account').trigger('click')
    await findButton(wrapper, 'Delete My Account').trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Could not delete your account')
    })

    // Still on the page, sheet still open, so the user can retry.
    expect(wrapper.find('.sheet').exists()).toBe(true)
  })

  test('reopening the sheet clears a previous error', async () => {
    deleteAccount.mockRejectedValueOnce(new Error('server error'))
    const wrapper = await mountSettings()

    await findButton(wrapper, 'Delete Account').trigger('click')
    await findButton(wrapper, 'Delete My Account').trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Could not delete your account')
    })

    await findButton(wrapper, 'Cancel').trigger('click')
    await findButton(wrapper, 'Delete Account').trigger('click')

    expect(wrapper.text()).not.toContain('Could not delete your account')
  })
})
