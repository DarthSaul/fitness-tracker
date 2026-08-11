<script setup lang="ts">
const { $pwa } = useNuxtApp()

const isIOS = computed(() => {
  if (!import.meta.client) return false
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
})

const isStandalone = computed(() => {
  if (!import.meta.client) return false
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as any).standalone === true
})

const showIOSPrompt = ref(false)

onMounted(() => {
  if (isIOS.value && !isStandalone.value) {
    const dismissed = localStorage.getItem('pwa-ios-install-dismissed')
    if (!dismissed) {
      showIOSPrompt.value = true
    }
  }
})

function dismissIOSPrompt(): void {
  showIOSPrompt.value = false
  localStorage.setItem('pwa-ios-install-dismissed', 'true')
}
</script>

<template>
  <!-- Android / Desktop: native install prompt -->
  <div
    v-if="$pwa?.showInstallPrompt"
    class="fixed right-4 bottom-24 left-4 z-20 mx-auto flex max-w-lg items-center gap-3 rounded-card bg-fill p-4 shadow-chip lg:right-6 lg:bottom-6 lg:left-auto lg:mx-0 lg:w-[380px]"
    style="padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 1rem)"
  >
    <div class="flex-1">
      <p class="text-sm font-medium text-label">Install Dr. Dumbbell</p>
      <p class="text-xs text-label-secondary">Add to your home screen for quick access</p>
    </div>
    <button
      class="rounded-tile bg-tint px-4 py-2 text-sm font-medium text-white active:bg-tint/80"
      @click="$pwa.install()"
    >
      Install
    </button>
    <button
      class="text-sm text-label-secondary active:text-label"
      @click="$pwa.cancelInstall()"
    >
      Not now
    </button>
  </div>

  <!-- iOS: manual instructions -->
  <div
    v-else-if="showIOSPrompt"
    class="fixed right-4 bottom-24 left-4 z-20 mx-auto flex max-w-lg items-center gap-3 rounded-card bg-fill p-4 shadow-chip lg:right-6 lg:bottom-6 lg:left-auto lg:mx-0 lg:w-[380px]"
    style="padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 1rem)"
  >
    <div class="flex-1">
      <p class="text-sm font-medium text-label">Install Dr. Dumbbell</p>
      <p class="text-xs text-label-secondary">
        Tap
        <svg class="inline-block h-4 w-4 align-text-bottom text-tint" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
        Share, then "Add to Home Screen"
      </p>
    </div>
    <button
      class="text-sm text-label-secondary active:text-label"
      @click="dismissIOSPrompt"
    >
      Got it
    </button>
  </div>
</template>
