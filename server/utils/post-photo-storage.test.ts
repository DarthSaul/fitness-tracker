import { describe, test, expect, vi, beforeEach } from 'vitest'

import {
  POST_PHOTOS_BUCKET,
  POST_PHOTO_TTL_SECONDS,
  postPhotoPath,
  signPostPhotos,
  uploadPostPhotoObject,
  removePostPhotoObjects,
} from './post-photo-storage'

const mockFrom = supabase.storage.from as ReturnType<typeof vi.fn>

function bucket(overrides: Record<string, unknown> = {}) {
  const b = {
    createSignedUrls: vi.fn(),
    upload: vi.fn().mockResolvedValue({ data: { path: 'p' }, error: null }),
    remove: vi.fn().mockResolvedValue({ data: [], error: null }),
    ...overrides,
  }
  mockFrom.mockReturnValue(b)
  return b
}

const log = { error: vi.fn(), warn: vi.fn() }

describe('postPhotoPath', () => {
  test('files each photo under its uploader', () => {
    expect(postPhotoPath('user1', 'ph1')).toBe('user1/ph1.jpg')
  })
})

describe('signPostPhotos', () => {
  beforeEach(() => vi.clearAllMocks())

  test('signs every photo in ONE storage call, against the private bucket, for 15 minutes', async () => {
    const b = bucket({
      createSignedUrls: vi.fn().mockResolvedValue({
        data: [
          { path: 'u/a.jpg', signedUrl: 'https://s/a', error: null },
          { path: 'u/b.jpg', signedUrl: 'https://s/b', error: null },
        ],
        error: null,
      }),
    })
    const before = Date.now()

    const result = await signPostPhotos(['u/a.jpg', 'u/b.jpg'])

    expect(mockFrom).toHaveBeenCalledWith(POST_PHOTOS_BUCKET)
    expect(b.createSignedUrls).toHaveBeenCalledTimes(1)
    expect(b.createSignedUrls).toHaveBeenCalledWith(['u/a.jpg', 'u/b.jpg'], POST_PHOTO_TTL_SECONDS)
    expect(POST_PHOTO_TTL_SECONDS).toBe(900)
    expect(Object.fromEntries(result.urls)).toEqual({ 'u/a.jpg': 'https://s/a', 'u/b.jpg': 'https://s/b' })
    const expires = new Date(result.expiresAt!).getTime()
    expect(expires).toBeGreaterThanOrEqual(before + 900_000)
    expect(expires).toBeLessThanOrEqual(Date.now() + 900_000)
  })

  test('no photos → no storage call and no expiry', async () => {
    bucket()

    expect(await signPostPhotos([])).toEqual({ urls: new Map(), expiresAt: null })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  test('throws (→ the route 500s) when storage refuses or skips a path', async () => {
    bucket({ createSignedUrls: vi.fn().mockResolvedValue({ data: null, error: { message: 'down' } }) })
    await expect(signPostPhotos(['u/a.jpg'])).rejects.toThrow(/signing failed/)

    bucket({ createSignedUrls: vi.fn().mockResolvedValue({ data: [{ path: 'u/a.jpg', signedUrl: null, error: 'not found' }], error: null }) })
    await expect(signPostPhotos(['u/a.jpg'])).rejects.toThrow(/could not sign/)
  })
})

describe('uploadPostPhotoObject', () => {
  beforeEach(() => vi.clearAllMocks())

  test('uploads processed JPEG bytes, never overwriting an existing object', async () => {
    const b = bucket()
    const data = Buffer.from([0xff, 0xd8])

    await uploadPostPhotoObject('u/a.jpg', data)

    expect(b.upload).toHaveBeenCalledWith('u/a.jpg', data, { contentType: 'image/jpeg', upsert: false })
  })

  test('throws when storage rejects the upload', async () => {
    bucket({ upload: vi.fn().mockResolvedValue({ data: null, error: { message: 'quota' } }) })
    await expect(uploadPostPhotoObject('u/a.jpg', Buffer.alloc(1))).rejects.toThrow(/upload failed/)
  })
})

describe('removePostPhotoObjects', () => {
  beforeEach(() => vi.clearAllMocks())

  test('removes the objects in one call', async () => {
    const b = bucket()

    await removePostPhotoObjects(['u/a.jpg', 'u/b.jpg'], log, 'DELETE /api/posts/:id')

    expect(b.remove).toHaveBeenCalledWith(['u/a.jpg', 'u/b.jpg'])
    expect(log.error).not.toHaveBeenCalled()
  })

  test('is best-effort: a storage failure is logged as post_photos.orphaned, never thrown', async () => {
    bucket({ remove: vi.fn().mockResolvedValue({ data: null, error: { message: 'down' } }) })

    await expect(removePostPhotoObjects(['u/a.jpg'], log, 'DELETE /api/posts/:id')).resolves.toBeUndefined()
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'post_photos.orphaned', paths: ['u/a.jpg'], route: 'DELETE /api/posts/:id' }),
      expect.any(String),
    )
  })

  test('a thrown storage error is also swallowed and logged', async () => {
    bucket({ remove: vi.fn().mockRejectedValue(new Error('socket hang up')) })

    await expect(removePostPhotoObjects(['u/a.jpg'], log, 'r')).resolves.toBeUndefined()
    expect(log.error).toHaveBeenCalled()
  })

  test('nothing to remove → no storage call', async () => {
    bucket()

    await removePostPhotoObjects([], log, 'r')

    expect(mockFrom).not.toHaveBeenCalled()
  })
})
