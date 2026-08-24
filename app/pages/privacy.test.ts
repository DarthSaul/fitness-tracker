/**
 * Tests for app/pages/privacy.vue — the public privacy policy.
 *
 * App Store Connect links to this page as the app's privacy policy URL, so it
 * must stay publicly reachable and keep making the disclosures the running
 * system actually implies. These tests pin the load-bearing ones: every
 * infrastructure provider that touches user data, every category of data
 * collected, and the deletion promise with its contact address.
 */
import { describe, test, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

const definePageMeta = vi.fn()
vi.stubGlobal('definePageMeta', definePageMeta)
vi.stubGlobal('useSeoMeta', vi.fn())
vi.stubGlobal('useHead', vi.fn())
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appUrl: 'https://app.example' } }))

async function mountPrivacy(): Promise<ReturnType<typeof mount>> {
  const Privacy = (await import('./privacy.vue')).default
  return mount(Privacy)
}

describe('privacy policy page', () => {
  test('renders in the public marketing shell', async () => {
    await mountPrivacy()

    expect(definePageMeta).toHaveBeenCalledWith({ layout: 'marketing' })
  })

  test('carries a title and a last-updated date', async () => {
    const text = (await mountPrivacy()).text()

    expect(text).toContain('Privacy Policy')
    expect(text).toContain('Last updated:')
  })

  /**
   * The categories of data the system actually collects. If one of these
   * assertions is in the way, the fix is to update the policy alongside the
   * code — not to delete the disclosure.
   */
  test('discloses every category of collected data', async () => {
    const text = (await mountPrivacy()).text()

    // Account info from OAuth and email sign-up
    expect(text).toContain('email address')
    expect(text.toLowerCase()).toContain('password')
    // Workout data
    expect(text).toMatch(/sets, reps, weights/i)
    // APNs device tokens (server/api/devices/register.post.ts)
    expect(text.toLowerCase()).toContain('device token')
    // Request logs carry IPs (00.logging.ts, rate-limit.ts)
    expect(text).toContain('IP address')
  })

  test('names every infrastructure provider that touches user data', async () => {
    const text = (await mountPrivacy()).text()

    for (const provider of ['Supabase', 'Vercel', 'Sentry', 'Upstash', 'Google', 'Apple']) {
      expect(text).toContain(provider)
    }
  })

  test('promises deletion with a contact address and a deadline', async () => {
    const text = (await mountPrivacy()).text()

    expect(text).toContain('graves.saul@gmail.com')
    expect(text).toContain('30 days')
  })
})
