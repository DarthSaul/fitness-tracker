/**
 * Bottom sheet with the standard iOS chrome: grabber, title row with a close
 * button, and optional detents.
 *
 * Wraps `UDrawer` so every sheet in the app shares one header treatment
 * instead of hand-rolling it. `title` and `description` are also forwarded to
 * the drawer itself, which renders them into a visually-hidden
 * DrawerTitle/DrawerDescription for reka-ui's accessibility contract.
 */
<script setup lang="ts">
const props = withDefaults(defineProps<{
  open: boolean
  title: string
  /** Screen-reader description. Required by reka-ui for labelled dialogs. */
  description?: string
  /**
   * Snap points, as fractions of the viewport height (iOS detents). Omit for a
   * sheet that sizes itself to its content.
   */
  detents?: (number | string)[]
  /** Hide the built-in title row when the body supplies its own header. */
  hideHeader?: boolean
}>(), {
  description: undefined,
  detents: undefined,
  hideHeader: false,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'close': []
}>()

const isOpen = computed({
  get: () => props.open,
  set: (value: boolean) => {
    emit('update:open', value)
    if (!value) emit('close')
  },
})

function close(): void {
  isOpen.value = false
}
</script>

<template>
  <UDrawer
    v-model:open="isOpen"
    direction="bottom"
    :title="title"
    :description="description"
    :snap-points="detents"
  >
    <template #content>
      <div class="mx-auto w-full max-w-lg px-4 pt-2 pb-8">
        <div v-if="!hideHeader" class="mb-4 flex items-center justify-between gap-3">
          <h3 class="text-headline">{{ title }}</h3>
          <button
            type="button"
            class="rounded-full p-1.5 text-label-secondary transition-colors hover:bg-label-secondary/15 hover:text-label"
            aria-label="Close"
            @click="close"
          >
            <UIcon name="i-lucide-x" class="size-5" />
          </button>
        </div>

        <slot />

        <div v-if="$slots.footer" class="mt-5">
          <slot name="footer" />
        </div>
      </div>
    </template>
  </UDrawer>
</template>
