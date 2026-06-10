import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[id].patch'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockFindUniqueFeedback = (prisma as typeof prisma).feedback.findUnique as ReturnType<typeof vi.fn>
const mockUpdateFeedback = (prisma as typeof prisma).feedback.update as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id = 'fb001') {
  mockGetRouterParam.mockReturnValue(id)
  return {
    path: `/api/feedback/${id}`,
    context: { userId: 'user001' },
  }
}

const mockFeedback = {
  id: 'fb001',
  userId: 'user001',
  message: 'The set timer drifts by a second',
  screenshotUrl: null,
  addressed: false,
}

describe('PATCH /api/feedback/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    mockReadBody.mockResolvedValue({ addressed: true })
  })

  test('marks feedback as addressed and returns the updated row', async () => {
    mockFindUniqueFeedback.mockResolvedValueOnce(mockFeedback)
    mockUpdateFeedback.mockResolvedValueOnce({ ...mockFeedback, addressed: true })

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ id: string; addressed: boolean }>)(event)

    expect(result).toEqual({ ...mockFeedback, addressed: true })
    expect(mockUpdateFeedback).toHaveBeenCalledWith({
      where: { id: 'fb001' },
      data: { addressed: true },
    })
  })

  test('can un-address feedback (addressed: false)', async () => {
    mockReadBody.mockResolvedValueOnce({ addressed: false })
    mockFindUniqueFeedback.mockResolvedValueOnce({ ...mockFeedback, addressed: true })
    mockUpdateFeedback.mockResolvedValueOnce({ ...mockFeedback, addressed: false })

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockUpdateFeedback).toHaveBeenCalledWith({
      where: { id: 'fb001' },
      data: { addressed: false },
    })
  })

  test('addresses feedback owned by another user (no ownership restriction)', async () => {
    // Authorization relaxed: any authenticated user may address any feedback.
    mockFindUniqueFeedback.mockResolvedValueOnce({ ...mockFeedback, userId: 'other-user' })
    mockUpdateFeedback.mockResolvedValueOnce({ ...mockFeedback, userId: 'other-user', addressed: true })

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ addressed: boolean }>)(event)

    expect(result.addressed).toBe(true)
    expect(mockUpdateFeedback).toHaveBeenCalledWith({
      where: { id: 'fb001' },
      data: { addressed: true },
    })
  })

  test('throws 400 when feedback ID is missing', async () => {
    const event = makeEvent(undefined as unknown as string)
    mockGetRouterParam.mockReturnValue(undefined)

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing feedback ID' })
  })

  test('throws 400 when feedback ID is blank/whitespace', async () => {
    const event = makeEvent('   ')

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing feedback ID' })
  })

  test('throws 400 when addressed is missing', async () => {
    mockReadBody.mockResolvedValueOnce({})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing addressed value' })
  })

  test('throws 400 when addressed is not a boolean', async () => {
    mockReadBody.mockResolvedValueOnce({ addressed: 'yes' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing addressed value' })
  })

  test('throws 404 when feedback not found', async () => {
    mockFindUniqueFeedback.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Feedback not found' })
    expect(mockUpdateFeedback).not.toHaveBeenCalled()
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('Feedback not found') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'Feedback not found'
    mockFindUniqueFeedback.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(404)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })

  test('wraps unknown errors as 500 and logs them', async () => {
    const dbError = new Error('connection reset')
    mockFindUniqueFeedback.mockRejectedValueOnce(dbError)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to update feedback' })

    expect(logger.error).toHaveBeenCalledWith(
      { err: dbError, route: 'PATCH /api/feedback/:id' },
      '[PATCH /api/feedback/:id] Failed to update feedback',
    )
  })
})
