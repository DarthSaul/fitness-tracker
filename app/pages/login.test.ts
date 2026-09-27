/**
 * Tests for app/pages/login.vue — error alert only.
 *
 * The OAuth handlers append `?rid=<requestId>` on failure and the alert renders
 * it as "Reference: …" so a screenshot maps to one `oauth.failure` log line.
 * That reference must disappear the moment a different error takes over the
 * alert, or it points triage at an unrelated request.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { ref, computed, reactive } from 'vue'
import { mount } from '@vue/test-utils'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('definePageMeta', vi.fn())
vi.stubGlobal('navigateTo', vi.fn())

const route = reactive({ query: {} as Record<string, string> })
vi.stubGlobal('useRoute', () => route)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appleAuthEnabled: true } }))

const signInWithEmail = vi.fn()
vi.stubGlobal('useAuth', () => ({
  signInWithGoogle: vi.fn(),
  signInWithApple: vi.fn(),
  signInWithEmail,
  signUpWithEmail: vi.fn(),
  resetPassword: vi.fn(),
}))

const UAlertStub = {
  name: 'UAlert',
  props: ['title', 'description', 'color', 'variant', 'icon'],
  template: '<div class="alert" :data-title="title" :data-description="description" />',
}

async function mountLogin(): Promise<ReturnType<typeof mount>> {
  const Login = (await import('./login.vue')).default
  return mount(Login, {
    global: {
      stubs: {
        UAlert: UAlertStub,
        UButton: true,
        UInput: true,
        UIcon: true,
        NuxtLink: true,
      },
    },
  })
}

const RID = '3f7c1a2e-9b5d-4c8a-8e11-6d2f0b4a7c93'

describe('login page — OAuth error reference', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    route.query = {}
  })

  test('shows the reference alongside an OAuth error', async () => {
    route.query = { error: 'apple_failed', rid: RID }

    const alert = (await mountLogin()).find('.alert')

    expect(alert.attributes('data-title')).toBe('Apple sign-in failed. Please try again.')
    expect(alert.attributes('data-description')).toBe(`Reference: ${RID}`)
  })

  test('omits the reference when the rid is not a UUID', async () => {
    route.query = { error: 'apple_failed', rid: 'not-a-request-id' }

    const alert = (await mountLogin()).find('.alert')

    expect(alert.attributes('data-description')).toBeUndefined()
  })

  /**
   * Regression: `errorMessage` gives formError precedence, but `errorRef` read
   * the query string independently — so a failed email submission after a failed
   * OAuth attempt showed the new message with the OLD request id attached.
   */
  test('drops the reference once a form error replaces the OAuth error', async () => {
    route.query = { error: 'apple_failed', rid: RID }
    signInWithEmail.mockRejectedValueOnce(
      Object.assign(new Error('bad creds'), { data: { message: 'Invalid email or password.' } }),
    )

    const wrapper = await mountLogin()
    expect(wrapper.find('.alert').attributes('data-description')).toBe(`Reference: ${RID}`)

    // Submit the email form unsuccessfully. Driving the real handler rather than
    // setting formError directly is what makes this a regression test.
    // `setupState` is internal and untyped; `<script setup>` bindings are not
    // exposed any other way.
    const state = (wrapper.vm.$ as unknown as { setupState: Record<string, unknown> }).setupState
    expect(typeof state.handleEmailSubmit).toBe('function')

    state.email = 'user@example.com'
    state.password = 'wrong'
    await (state.handleEmailSubmit as () => Promise<void>)()
    await wrapper.vm.$nextTick()

    const alert = wrapper.find('.alert')
    expect(alert.attributes('data-title')).toBe('Invalid email or password.')
    expect(alert.attributes('data-description')).toBeUndefined()
  })
})

describe('login page — signup deep link', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    route.query = {}
  })

  function button(wrapper: ReturnType<typeof mount>, label: string) {
    // `includes`, not equality: the Google button's text also carries its "G" glyph.
    return wrapper.findAll('button').find(b => b.text().includes(label))
  }

  test('?signup=1 opens straight into the signup form', async () => {
    route.query = { signup: '1' }

    const wrapper = await mountLogin()

    expect(wrapper.find('form').exists()).toBe(true)
    expect(button(wrapper, 'Sign in with Google')).toBeUndefined()
  })

  /**
   * A visitor who arrived from "Get started" but already has an account most
   * likely signed up with a provider, so "Sign in instead" returns to the
   * provider buttons rather than the email sign-in form.
   */
  test('"Sign in instead" from signup shows the provider buttons', async () => {
    route.query = { signup: '1' }
    const wrapper = await mountLogin()

    await button(wrapper, 'Sign in instead')!.trigger('click')

    expect(wrapper.find('form').exists()).toBe(false)
    expect(button(wrapper, 'Sign in with Google')).toBeDefined()
    expect(button(wrapper, 'Sign in with Apple')).toBeDefined()
  })

  test('"Sign in instead" from password reset stays on the email sign-in form', async () => {
    const wrapper = await mountLogin()
    await button(wrapper, 'Continue with email')!.trigger('click')
    await button(wrapper, 'Forgot password?')!.trigger('click')

    await button(wrapper, 'Sign in instead')!.trigger('click')

    expect(wrapper.find('form').exists()).toBe(true)
    expect(button(wrapper, 'Forgot password?')).toBeDefined()
  })
})
