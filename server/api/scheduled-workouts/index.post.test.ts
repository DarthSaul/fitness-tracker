/**
 * Tests for server/api/scheduled-workouts/index.post.ts
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.post'

const mockFindUserProgram = (prisma as typeof prisma).userProgram.findUnique as ReturnType<typeof vi.fn>
const mockFindDay = (prisma as typeof prisma).programDay.findFirst as ReturnType<typeof vi.fn>
// The global prisma mock has no scheduledWorkout.create; add it here rather than in vitest.setup.ts.
const mockCreate = vi.fn()
;(prisma as unknown as { scheduledWorkout: Record<string, unknown> }).scheduledWorkout.create = mockCreate
const mockReadBody = readBody as ReturnType<typeof vi.fn>

const validBody = { userProgramId: 'up1', weekNumber: 2, dayNumber: 3, scheduledDate: '2026-10-08' }
const mockCreated = {
  id: 'sw1',
  userProgramId: 'up1',
  weekNumber: 2,
  dayNumber: 3,
  scheduledDate: new Date('2026-10-08'),
}

function call(body: unknown = validBody, userId: string | null = 'user001') {
  mockReadBody.mockResolvedValue(body)
  const event = { path: '/api/scheduled-workouts', context: { userId: userId ?? undefined }, node: { res: { statusCode: 200 } } }
  const result = (handler as unknown as (e: typeof event) => Promise<Record<string, unknown>>)(event)
  return { event, result }
}

describe('POST /api/scheduled-workouts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUserProgram.mockResolvedValue({ userId: 'user001', programId: 'prog1' })
    mockFindDay.mockResolvedValue({ id: 'day1' })
    mockCreate.mockResolvedValue(mockCreated)
  })

  test('schedules the day and responds 201 with the new row', async () => {
    const { event, result } = call()

    expect(await result).toEqual({ scheduledWorkout: mockCreated })
    expect(event.node.res.statusCode).toBe(201)
    expect(mockFindUserProgram).toHaveBeenCalledWith({
      where: { id: 'up1' },
      select: { userId: true, programId: true },
    })
    expect(mockFindDay).toHaveBeenCalledWith({
      where: { programWeek: { programId: 'prog1', weekNumber: 2 }, dayNumber: 3 },
    })
    expect(mockCreate).toHaveBeenCalledWith({
      data: { userProgramId: 'up1', weekNumber: 2, dayNumber: 3, scheduledDate: new Date('2026-10-08') },
    })
  })

  test('401 when unauthenticated, before reading the body', async () => {
    const { result } = call(validBody, null)

    await expect(result).rejects.toMatchObject({ statusCode: 401 })
    expect(mockReadBody).not.toHaveBeenCalled()
  })

  test.each([
    ['the body is empty', null],
    ['userProgramId is missing', { ...validBody, userProgramId: undefined }],
    ['weekNumber is missing', { ...validBody, weekNumber: undefined }],
    ['weekNumber is 0', { ...validBody, weekNumber: 0 }],
    ['dayNumber is missing', { ...validBody, dayNumber: undefined }],
    ['scheduledDate is empty', { ...validBody, scheduledDate: '' }],
  ])('400 when %s', async (_label, body) => {
    const { result } = call(body)

    await expect(result).rejects.toMatchObject({ statusCode: 400 })
    expect(mockFindUserProgram).not.toHaveBeenCalled()
  })

  test.each([
    ['a fractional number', 1.5],
    ['a numeric string', '2'],
    ['negative', -1],
  ])('400 when weekNumber is %s', async (_label, weekNumber) => {
    const { result } = call({ ...validBody, weekNumber })

    await expect(result).rejects.toMatchObject({ statusCode: 400, statusMessage: 'weekNumber must be a positive integer' })
    expect(mockFindUserProgram).not.toHaveBeenCalled()
  })

  test.each([
    ['a fractional number', 1.5],
    ['a numeric string', '3'],
    ['negative', -2],
  ])('400 when dayNumber is %s', async (_label, dayNumber) => {
    const { result } = call({ ...validBody, dayNumber })

    await expect(result).rejects.toMatchObject({ statusCode: 400, statusMessage: 'dayNumber must be a positive integer' })
    expect(mockFindUserProgram).not.toHaveBeenCalled()
  })

  test('400 when scheduledDate is not a valid date', async () => {
    const { result } = call({ ...validBody, scheduledDate: 'garbage' })

    await expect(result).rejects.toMatchObject({ statusCode: 400, statusMessage: 'scheduledDate must be a valid date' })
    expect(mockFindUserProgram).not.toHaveBeenCalled()
  })

  test('404 when the user program does not exist', async () => {
    mockFindUserProgram.mockResolvedValueOnce(null)
    const { result } = call()

    await expect(result).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User program not found' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('403 when the program belongs to another user, without creating anything', async () => {
    mockFindUserProgram.mockResolvedValueOnce({ userId: 'someone-else', programId: 'prog1' })
    const { result } = call()

    await expect(result).rejects.toMatchObject({ statusCode: 403, statusMessage: 'Forbidden' })
    expect(mockFindDay).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('400 when the program has no such week and day', async () => {
    mockFindDay.mockResolvedValueOnce(null)
    const { result } = call()

    await expect(result).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Program day not found for week 2, day 3',
    })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('409 when the day or date is already scheduled (unique violation)', async () => {
    mockCreate.mockRejectedValueOnce(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }))
    const { result } = call()

    await expect(result).rejects.toMatchObject({ statusCode: 409, statusMessage: 'This day or date is already scheduled' })
    expect(logger.error).not.toHaveBeenCalled()
  })

  test('500 with a structured log on any other database error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('connection reset'))
    const { result } = call()

    await expect(result).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to schedule workout' })
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ route: 'POST /api/scheduled-workouts' }),
      expect.any(String),
    )
  })
})
