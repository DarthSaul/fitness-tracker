/**
 * Tests for server/api/scheduled-workouts/[id].delete.ts
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[id].delete'

// The global prisma mock has no scheduledWorkout.findUnique/delete; add them here rather than in vitest.setup.ts.
const mockFindUnique = vi.fn()
const mockDelete = vi.fn()
const scheduledModel = (prisma as unknown as { scheduledWorkout: Record<string, unknown> }).scheduledWorkout
scheduledModel.findUnique = mockFindUnique
scheduledModel.delete = mockDelete
const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>

function call(id: string | null = 'sw1', userId: string | null = 'user001') {
  mockGetRouterParam.mockReturnValue(id ?? undefined)
  const event = { path: `/api/scheduled-workouts/${id}`, context: { userId: userId ?? undefined } }
  return (handler as unknown as (e: typeof event) => Promise<Record<string, unknown>>)(event)
}

describe('DELETE /api/scheduled-workouts/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUnique.mockResolvedValue({ id: 'sw1', userProgram: { userId: 'user001' } })
    mockDelete.mockResolvedValue({ id: 'sw1' })
  })

  test('deletes the owner\'s scheduled workout and returns success', async () => {
    expect(await call()).toEqual({ success: true })
    expect(mockGetRouterParam).toHaveBeenCalledWith(expect.anything(), 'id')
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'sw1' },
      include: { userProgram: { select: { userId: true } } },
    })
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'sw1' } })
  })

  test('401 when unauthenticated, before any query', async () => {
    await expect(call('sw1', null)).rejects.toMatchObject({ statusCode: 401 })
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  test('400 when the id param is missing', async () => {
    await expect(call(null)).rejects.toMatchObject({ statusCode: 400, statusMessage: 'id is required' })
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  test('404 when the scheduled workout does not exist', async () => {
    mockFindUnique.mockResolvedValueOnce(null)

    await expect(call()).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Scheduled workout not found' })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  test('403 and no delete when it belongs to another user', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'sw1', userProgram: { userId: 'someone-else' } })

    await expect(call()).rejects.toMatchObject({ statusCode: 403, statusMessage: 'Forbidden' })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  test('500 with a structured log on an unexpected database error', async () => {
    mockDelete.mockRejectedValueOnce(new Error('connection reset'))

    await expect(call()).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to delete scheduled workout' })
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ route: 'DELETE /api/scheduled-workouts' }),
      expect.any(String),
    )
  })

  test('rethrows an error that already carries a status code, without logging it', async () => {
    mockDelete.mockRejectedValueOnce(Object.assign(new Error('busy'), { statusCode: 503 }))

    await expect(call()).rejects.toMatchObject({ statusCode: 503 })
    expect(logger.error).not.toHaveBeenCalled()
  })
})
