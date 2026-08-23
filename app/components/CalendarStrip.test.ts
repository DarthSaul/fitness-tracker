import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import CalendarStrip from './CalendarStrip.vue'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('onMounted', onMounted)
vi.stubGlobal('onBeforeUnmount', onBeforeUnmount)

// Friday, Aug 21 2026 — the visible week runs Sun Aug 16 → Sat Aug 22.
const NOW = new Date(2026, 7, 21, 12, 0, 0)

// The component leaves `now` null until onMounted, so the first paint is the
// skeleton — wait one tick for the re-render before asserting.
async function mountStrip(props: {
  modelValue?: Date
  scheduledDates?: string[]
  completedDates?: string[]
} = {}) {
  const wrapper = mount(CalendarStrip, {
    props,
    global: { stubs: { UIcon: true, AppSkeleton: true } },
  })
  await nextTick()
  return wrapper
}

function findByAriaLabel(wrapper: VueWrapper, prefix: string) {
  return wrapper.findAll('button').find(b => b.attributes('aria-label')?.startsWith(prefix))
}

describe('CalendarStrip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('renders the week strip with a pressable month label and chevron', async () => {
    const wrapper = await mountStrip()

    const toggle = wrapper.find('[aria-label="Open month calendar"]')
    expect(toggle.exists()).toBe(true)
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.find('[name="i-lucide-chevron-down"]').exists()).toBe(true)
    expect(toggle.text()).toContain('August 2026')

    // Seven day cells, week navigation
    expect(wrapper.findAll('button[aria-label^="Select "]')).toHaveLength(7)
    expect(wrapper.find('[aria-label="Previous week"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Next week"]').exists()).toBe(true)
  })

  test('pressing the month label expands to a full month grid', async () => {
    const wrapper = await mountStrip()

    await wrapper.find('[aria-label="Open month calendar"]').trigger('click')

    const toggle = wrapper.find('[aria-label="Close month calendar"]')
    expect(toggle.exists()).toBe(true)
    expect(toggle.attributes('aria-expanded')).toBe('true')

    // One cell per day of August, and month navigation replaces week navigation
    expect(wrapper.findAll('button[aria-label^="Select August"]')).toHaveLength(31)
    expect(wrapper.find('[aria-label="Previous month"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Next month"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Previous week"]').exists()).toBe(false)
  })

  test('pressing the label again collapses back to the week strip', async () => {
    const wrapper = await mountStrip()

    await wrapper.find('[aria-label="Open month calendar"]').trigger('click')
    await wrapper.find('[aria-label="Close month calendar"]').trigger('click')

    expect(wrapper.find('[aria-label="Open month calendar"]').attributes('aria-expanded')).toBe('false')
    expect(wrapper.findAll('button[aria-label^="Select "]')).toHaveLength(7)
  })

  test('month navigation steps between months', async () => {
    const wrapper = await mountStrip()

    await wrapper.find('[aria-label="Open month calendar"]').trigger('click')
    await wrapper.find('[aria-label="Previous month"]').trigger('click')

    expect(wrapper.find('[aria-label="Close month calendar"]').text()).toContain('July 2026')
    expect(wrapper.findAll('button[aria-label^="Select July"]')).toHaveLength(31)
  })

  test('past completed days get a green border in the week strip; today and selected do not', async () => {
    const wrapper = await mountStrip({
      modelValue: new Date(2026, 7, 18),
      completedDates: ['2026-08-19', '2026-08-21', '2026-08-18'],
    })

    // Wed Aug 19: past + completed → green ring
    const completed = findByAriaLabel(wrapper, 'Select Wed 19')!
    expect(completed.attributes('aria-label')).toContain('completed workout')
    expect(completed.html()).toContain('ring-ios-green')

    // Fri Aug 21 is today: completed but not past → no green ring
    const today = findByAriaLabel(wrapper, 'Select Fri 21')!
    expect(today.html()).not.toContain('ring-ios-green')

    // Tue Aug 18 is selected: selection styling wins over the green ring
    const selected = findByAriaLabel(wrapper, 'Select Tue 18')!
    expect(selected.html()).not.toContain('ring-ios-green')
  })

  test('past completed days get a green border in the month grid', async () => {
    const wrapper = await mountStrip({ completedDates: ['2026-08-19'] })

    await wrapper.find('[aria-label="Open month calendar"]').trigger('click')

    const completed = findByAriaLabel(wrapper, 'Select August 19')!
    expect(completed.attributes('aria-label')).toContain('completed workout')
    expect(completed.html()).toContain('ring-ios-green')

    const plain = findByAriaLabel(wrapper, 'Select August 12')!
    expect(plain.html()).not.toContain('ring-ios-green')
  })

  test('selecting a day in the month grid emits the picked date', async () => {
    const wrapper = await mountStrip()

    await wrapper.find('[aria-label="Open month calendar"]').trigger('click')
    await findByAriaLabel(wrapper, 'Select August 5')!.trigger('click')

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![0]![0]).toEqual(new Date(2026, 7, 5))
  })

  test('scheduled days keep their dot indicator in the month grid', async () => {
    const wrapper = await mountStrip({ scheduledDates: ['2026-08-25'] })

    await wrapper.find('[aria-label="Open month calendar"]').trigger('click')

    const scheduled = findByAriaLabel(wrapper, 'Select August 25')!
    expect(scheduled.attributes('aria-label')).toContain('scheduled workout')
    expect(scheduled.html()).toContain('bg-ios-green')
  })
})
