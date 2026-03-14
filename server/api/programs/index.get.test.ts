/**
 * Tests for server/api/programs/index.get.ts
 *
 * Coverage strategy:
 *  - Happy path: returns array of programs from findMany
 *  - Empty state: returns empty array when no programs exist
 *  - Error propagation: throws 500 when findMany rejects
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.get'

const mockFindMany = (prisma as typeof prisma).program.findMany as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent() {
  return { path: '/api/programs', context: {} }
}

describe('GET /api/programs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns array of programs from findMany', async () => {
    const programs = [
      {
        id: 'clprog001',
        name: 'Brick House',
        description: 'A strength program',
        createdAt: new Date(),
        _count: { weeks: 4 },
      },
      {
        id: 'clprog002',
        name: 'Cardio Blast',
        description: null,
        createdAt: new Date(),
        _count: { weeks: 6 },
      },
    ]
    mockFindMany.mockResolvedValueOnce(programs)

    const event = makeEvent()
    const result = await (handler as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(programs)
    expect(mockFindMany).toHaveBeenCalledOnce()
    expect(mockFindMany).toHaveBeenCalledWith({
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        _count: { select: { weeks: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  })

  test('returns empty array when no programs exist', async () => {
    mockFindMany.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual([])
    expect(mockFindMany).toHaveBeenCalledOnce()
  })

  test('throws 500 when findMany rejects', async () => {
    mockFindMany.mockRejectedValueOnce(new Error('database connection lost'))
    mockCreateError.mockImplementationOnce((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })

    const event = makeEvent()
    await expect(
      (handler as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch programs' })

    expect(mockCreateError).toHaveBeenCalledWith({
      statusCode: 500,
      statusMessage: 'Failed to fetch programs',
    })
  })
})
