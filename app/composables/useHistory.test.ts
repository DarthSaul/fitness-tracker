import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { HistoryEntry } from '~/types/history'
import { useHistory } from './useHistory'

const mockFetch = $fetch as unknown as ReturnType<typeof vi.fn>

function entry(id: string, completedAt = '2026-01-15T10:00:00.000Z'): HistoryEntry {
  return {
    type: 'PROGRAM',
    id,
    userId: 'u1',
    userProgramId: 'up1',
    programName: 'Brick House',
    weekNumber: 1,
    dayNumber: 1,
    status: 'COMPLETED',
    startedAt: completedAt,
    completedAt,
    notes: null,
    _count: { completedSets: 12 },
  }
}

/** A page of exactly `size` rows, which reads as "there may be more". */
function fullPage(size: number, prefix = 's'): HistoryEntry[] {
  return Array.from({ length: size }, (_, i) => entry(`${prefix}${i}`))
}

describe('useHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('loads the first page', async () => {
    mockFetch.mockResolvedValueOnce({ sessions: [entry('a')] })

    const { sessions, status, load } = useHistory()
    await load()

    expect(mockFetch).toHaveBeenCalledWith('/api/history', { query: { limit: 20 } })
    expect(sessions.value).toHaveLength(1)
    expect(status.value).toBe('success')
  })

  // An empty history and a failed request must not look the same on screen.
  test('reports an error status when the request fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'))

    const { sessions, status, load } = useHistory()
    await load()

    expect(status.value).toBe('error')
    expect(sessions.value).toEqual([])
  })

  test('stops paging when the first page is short', async () => {
    mockFetch.mockResolvedValueOnce({ sessions: [entry('a')] })

    const { hasMore, load } = useHistory()
    await load()

    expect(hasMore.value).toBe(false)
  })

  test('keeps paging when the first page is full', async () => {
    mockFetch.mockResolvedValueOnce({ sessions: fullPage(20) })

    const { hasMore, load } = useHistory()
    await load()

    expect(hasMore.value).toBe(true)
  })

  // The endpoint rejects `before` without `beforeId`, and rows sharing a
  // timestamp would be dropped without the id tiebreaker.
  test('pages with a composite cursor taken from the last row', async () => {
    mockFetch.mockResolvedValueOnce({ sessions: fullPage(2) })
    mockFetch.mockResolvedValueOnce({ sessions: [entry('next')] })

    const { sessions, load, loadMore } = useHistory(2)
    await load()
    await loadMore()

    expect(mockFetch).toHaveBeenLastCalledWith('/api/history', {
      query: { limit: 2, before: '2026-01-15T10:00:00.000Z', beforeId: 's1' },
    })
    expect(sessions.value.map(s => s.id)).toEqual(['s0', 's1', 'next'])
  })

  test('does not page past the end', async () => {
    mockFetch.mockResolvedValueOnce({ sessions: [entry('a')] })

    const { load, loadMore } = useHistory()
    await load()
    await loadMore()

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  test('does not page before the first load', async () => {
    const { loadMore } = useHistory()
    await loadMore()

    expect(mockFetch).not.toHaveBeenCalled()
  })

  // Scroll handlers fire repeatedly; without this guard the same page would be
  // appended several times over.
  test('ignores a second loadMore while one is in flight', async () => {
    mockFetch.mockResolvedValueOnce({ sessions: fullPage(2) })
    const { load, loadMore } = useHistory(2)
    await load()

    let release: (value: unknown) => void = () => {}
    mockFetch.mockReturnValueOnce(new Promise((resolve) => { release = resolve }))

    const first = loadMore()
    await loadMore()
    expect(mockFetch).toHaveBeenCalledTimes(2)

    release({ sessions: [] })
    await first
  })

  // A failed page must leave the rows already on screen intact.
  test('keeps loaded rows when a subsequent page fails', async () => {
    mockFetch.mockResolvedValueOnce({ sessions: fullPage(2) })
    mockFetch.mockRejectedValueOnce(new Error('network error'))

    const { sessions, hasMore, loadingMore, load, loadMore } = useHistory(2)
    await load()
    await loadMore()

    expect(sessions.value).toHaveLength(2)
    expect(hasMore.value).toBe(false)
    expect(loadingMore.value).toBe(false)
  })
})
