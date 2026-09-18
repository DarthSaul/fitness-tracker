/**
 * Tests for server/api/user-programs/index.get.ts
 *
 * Coverage strategy:
 *  - Happy path: returns list of user programs with nested program details
 *  - Runs: collapses to one current run per program by default (open run, else
 *    latest completed), hides archived runs, exposes everything with ?runs=all,
 *    and annotates rows with runNumber / completedRunCount
 *  - Empty list: returns empty array when user has no saved programs
 *  - Error propagation: throws 500 when findMany rejects (non-H3 error)
 *  - H3 error pass-through: re-throws H3 errors without wrapping as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.get'

const mockFindMany = (prisma as typeof prisma).userProgram.findMany as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>
const mockGetQuery = getQuery as ReturnType<typeof vi.fn>

function makeEvent() {
  return { path: '/api/user-programs', context: { userId: 'user001' } }
}

const mockUserPrograms = [
  {
    id: 'up001',
    userId: 'user001',
    programId: 'prog001',
    isActive: true,
    currentWeek: 1,
    currentDay: 1,
    startedAt: new Date('2026-02-01'),
    completedAt: null,
    archivedAt: null,
    program: { id: 'prog001', name: 'Brick House', description: 'A strength program' },
  },
  {
    id: 'up002',
    userId: 'user001',
    programId: 'prog002',
    isActive: false,
    currentWeek: 2,
    currentDay: 3,
    startedAt: new Date('2026-01-01'),
    completedAt: null,
    archivedAt: null,
    program: { id: 'prog002', name: 'Cardio Blast', description: null },
  },
]

describe('GET /api/user-programs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetQuery.mockReturnValue({})
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('returns list of user programs with nested program details', async () => {
    mockFindMany.mockResolvedValueOnce(mockUserPrograms)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockUserPrograms.map((up) => ({ ...up, runNumber: 1, completedRunCount: 0 })))
    expect(mockFindMany).toHaveBeenCalledOnce()
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user001' },
      include: {
        program: { select: { id: true, name: true, description: true } },
      },
      orderBy: { startedAt: 'desc' },
    })
  })

  describe('runs', () => {
    const program = { id: 'prog001', name: 'Arm Farm', description: null }
    function run(id: string, startedAt: string, extra: Record<string, unknown> = {}) {
      return {
        id, userId: 'user001', programId: 'prog001', isActive: false, currentWeek: 1, currentDay: 1,
        startedAt: new Date(startedAt), completedAt: null, archivedAt: null, program, ...extra,
      }
    }
    // findMany returns startedAt desc
    const archived = run('up-archived', '2026-01-01', { completedAt: new Date('2026-02-01'), archivedAt: new Date('2026-02-02') })
    const completed1 = run('up-done-1', '2026-03-01', { completedAt: new Date('2026-04-01') })
    const completed2 = run('up-done-2', '2026-05-01', { completedAt: new Date('2026-06-01') })
    const open = run('up-open', '2026-07-01', { isActive: true })

    test('collapses to the open run when a program has several runs', async () => {
      mockFindMany.mockResolvedValueOnce([open, completed2, completed1, archived])

      const event = makeEvent()
      const result = await (handler as unknown as (e: typeof event) => Promise<Array<Record<string, unknown>>>)(event)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ id: 'up-open', runNumber: 4, completedRunCount: 3 })
    })

    test('falls back to the latest completed run when there is no open run', async () => {
      mockFindMany.mockResolvedValueOnce([completed2, completed1, archived])

      const event = makeEvent()
      const result = await (handler as unknown as (e: typeof event) => Promise<Array<Record<string, unknown>>>)(event)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ id: 'up-done-2', runNumber: 3 })
    })

    test('hides a program whose only runs are archived', async () => {
      mockFindMany.mockResolvedValueOnce([archived])

      const event = makeEvent()
      const result = await (handler as unknown as (e: typeof event) => Promise<unknown[]>)(event)

      expect(result).toEqual([])
    })

    test('returns every run, including archived, with ?runs=all', async () => {
      mockGetQuery.mockReturnValue({ runs: 'all' })
      mockFindMany.mockResolvedValueOnce([open, completed2, completed1, archived])

      const event = makeEvent()
      const result = await (handler as unknown as (e: typeof event) => Promise<Array<{ id: string; runNumber: number }>>)(event)

      expect(result.map((r) => [r.id, r.runNumber])).toEqual([
        ['up-open', 4], ['up-done-2', 3], ['up-done-1', 2], ['up-archived', 1],
      ])
    })
  })

  test('returns empty array when user has no saved programs', async () => {
    mockFindMany.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual([])
  })

  test('throws 500 when findMany rejects with a non-H3 error', async () => {
    const dbError = new Error('database timeout')
    mockFindMany.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to list user programs' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'GET /api/user-programs' }, '[GET /api/user-programs] Failed to list user programs')
    consoleSpy.mockRestore()
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('Unauthorized') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 401
    h3Error.statusMessage = 'Unauthorized'
    mockFindMany.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(401)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
