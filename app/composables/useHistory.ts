import type { HistoryEntry, HistoryResponse } from '~/types/history'

/** Matches the endpoint's own default; it clamps anything above 50. */
const PAGE_SIZE = 20

/**
 * Cursor-paginated unified workout history (program + standalone sessions).
 *
 * `GET /api/history` pages on a composite `(completedAt, id)` cursor rather
 * than an offset, so sessions completed in the same second can't be silently
 * dropped at a page boundary. Both cursor params must be sent together or the
 * endpoint rejects the request.
 */
export function useHistory(pageSize: number = PAGE_SIZE) {
  const sessions = ref<HistoryEntry[]>([])
  const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
  const loadingMore = ref(false)
  const hasMore = ref(true)
  /** A failed page, as distinct from having reached the end of the list. */
  const pageError = ref(false)

  /**
   * A short page means the server ran out of rows. Requesting exactly
   * `pageSize` is inconclusive, so `hasMore` stays true until a short page or
   * an empty one arrives.
   */
  function applyPage(page: HistoryEntry[]): void {
    hasMore.value = page.length === pageSize
  }

  /** Loads the first page, replacing anything already held. */
  async function load(): Promise<void> {
    status.value = 'pending'
    try {
      const result = await $fetch<HistoryResponse>('/api/history', {
        query: { limit: pageSize },
      })
      sessions.value = result.sessions
      applyPage(result.sessions)
      status.value = 'success'
    } catch {
      // Distinct from an empty history: the page must not tell someone with
      // years of training that they have never worked out.
      status.value = 'error'
    }
  }

  /** Appends the next page. No-op while one is in flight or once exhausted. */
  async function loadMore(): Promise<void> {
    if (loadingMore.value || !hasMore.value || sessions.value.length === 0) return

    const cursor = sessions.value[sessions.value.length - 1]!
    loadingMore.value = true
    pageError.value = false
    try {
      const result = await $fetch<HistoryResponse>('/api/history', {
        query: {
          limit: pageSize,
          before: cursor.completedAt,
          beforeId: cursor.id,
        },
      })
      sessions.value = [...sessions.value, ...result.sessions]
      applyPage(result.sessions)
    } catch {
      // Leave the rows already on screen alone, and leave `hasMore` set so a
      // retry is still possible — a failed page is not the end of the list,
      // and conflating the two silently truncates someone's history.
      pageError.value = true
    } finally {
      loadingMore.value = false
    }
  }

  return { sessions, status, loadingMore, hasMore, pageError, load, loadMore }
}
