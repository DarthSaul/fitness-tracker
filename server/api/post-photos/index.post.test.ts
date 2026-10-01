import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.post'

const mockReadMultipart = readMultipartFormData as ReturnType<typeof vi.fn>
const mockProcess = processPostPhoto as ReturnType<typeof vi.fn>
const mockUpload = uploadPostPhotoObject as ReturnType<typeof vi.fn>
const mockRemoveObjects = removePostPhotoObjects as ReturnType<typeof vi.fn>
const mockRateLimitByKey = rateLimitByKey as ReturnType<typeof vi.fn>
const mockFindMany = prisma.postPhoto.findMany as ReturnType<typeof vi.fn>
const mockDeleteMany = prisma.postPhoto.deleteMany as ReturnType<typeof vi.fn>
const mockCreate = prisma.postPhoto.create as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string }; node: { res: { statusCode: number } } }

const raw = Buffer.from('raw-upload-bytes')
const processed = { data: Buffer.from('processed-jpeg'), width: 1536, height: 2048 }

function makeEvent(): Event {
  return { path: '/api/post-photos', context: { userId: 'u1' }, node: { res: { statusCode: 200 } } }
}
const call = (event: Event) => (handler as unknown as (e: Event) => Promise<unknown>)(event)
const httpError = (statusCode: number) => Object.assign(new Error(`HTTP ${statusCode}`), { statusCode })

describe('POST /api/post-photos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadMultipart.mockResolvedValue([{ name: 'photo', data: raw, type: 'image/jpeg', filename: 'IMG_1.jpg' }])
    mockProcess.mockResolvedValue(processed)
    mockRateLimitByKey.mockResolvedValue(undefined)
    mockFindMany.mockResolvedValue([])
    // Returns what the route's `select` asks for: id, width, height.
    mockCreate.mockImplementation(async ({ data }: { data: { width: number; height: number } }) => ({ id: 'ph1', width: data.width, height: data.height }))
  })

  test('processes, stores ONLY the processed bytes under the uploader, records the row → 201 { id, width, height }', async () => {
    const event = makeEvent()

    const result = await call(event)

    expect(mockProcess).toHaveBeenCalledWith(raw)
    const [path, bytes] = mockUpload.mock.calls[0]!
    expect(path).toMatch(/^u1\/[0-9a-f-]{36}\.jpg$/)
    expect(bytes).toBe(processed.data)
    expect(mockCreate).toHaveBeenCalledWith({
      data: { uploaderId: 'u1', storagePath: path, width: 1536, height: 2048 },
      select: { id: true, width: true, height: true },
    })
    expect(event.node.res.statusCode).toBe(201)
    // No URL: an unattached photo is only shown from the app's local copy.
    expect(result).toEqual({ id: 'ph1', width: 1536, height: 2048 })
  })

  test('the uploader comes from the session; the declared filename and type are ignored', async () => {
    mockReadMultipart.mockResolvedValueOnce([{ name: 'photo', data: raw, type: 'image/heic', filename: '../../other-user/x.jpg' }])

    await call(makeEvent())

    expect(mockUpload.mock.calls[0]![0]).toMatch(/^u1\//)
  })

  test("sweeps the caller's own unattached uploads older than 24h — rows, then objects", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 'old1', storagePath: 'u1/old1.jpg' },
      { id: 'old2', storagePath: 'u1/old2.jpg' },
    ])
    const before = Date.now()

    await call(makeEvent())

    const where = mockFindMany.mock.calls[0]![0].where
    expect(where).toMatchObject({ uploaderId: 'u1', postId: null })
    const cutoff = (where.createdAt.lt as Date).getTime()
    expect(cutoff).toBeGreaterThanOrEqual(before - 24 * 3600_000 - 1000)
    expect(cutoff).toBeLessThanOrEqual(Date.now() - 24 * 3600_000 + 1000)
    // Re-guarded on postId null, so a photo attached meanwhile is never deleted.
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ['old1', 'old2'] }, postId: null } })
    expect(mockRemoveObjects).toHaveBeenCalledWith(['u1/old1.jpg', 'u1/old2.jpg'], expect.anything(), 'POST /api/post-photos')
  })

  test('nothing stale → no sweep writes', async () => {
    await call(makeEvent())

    expect(mockDeleteMany).not.toHaveBeenCalled()
    expect(mockRemoveObjects).not.toHaveBeenCalled()
  })

  test('if recording the row fails, the uploaded object is removed and the request 500s', async () => {
    mockCreate.mockRejectedValueOnce(new Error('db down'))

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to upload photo' })
    const uploadedPath = mockUpload.mock.calls[0]![0]
    expect(mockRemoveObjects).toHaveBeenCalledWith([uploadedPath], expect.anything(), 'POST /api/post-photos')
  })

  test.each([
    ['no multipart body', undefined],
    ['no photo field', [{ name: 'other', data: raw }]],
    ['an empty photo', [{ name: 'photo', data: Buffer.alloc(0) }]],
  ])('400 for %s, before any work', async (_label, parts) => {
    mockReadMultipart.mockResolvedValueOnce(parts)

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing photo' })
    expect(mockProcess).not.toHaveBeenCalled()
  })

  test.each([[413], [415]])('passes the pipeline\'s %i through, storing nothing', async (statusCode) => {
    mockProcess.mockRejectedValueOnce(httpError(statusCode))

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode })
    expect(mockUpload).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('rate-limits per user, 60 per hour, before processing', async () => {
    mockRateLimitByKey.mockRejectedValueOnce(httpError(429))

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 429 })
    expect(mockRateLimitByKey).toHaveBeenCalledWith('post-photo:u1', 60, '1 h')
    expect(mockProcess).not.toHaveBeenCalled()
  })

  test('500 with a generic message when storage rejects the upload', async () => {
    mockUpload.mockRejectedValueOnce(new Error('post-photos: upload failed: quota'))

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to upload photo' })
    expect(mockCreate).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalled()
  })
})
