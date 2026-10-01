import { randomUUID } from 'node:crypto'

defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Upload a post photo',
    description:
      'Uploads one photo (multipart field `photo`, at most 4 MB — downscale on the client first). The server decodes it, '
      + 'bakes in the orientation, strips ALL metadata (EXIF, including GPS), resizes to at most 2048px and stores a '
      + 'JPEG. Returns an id to pass in `photoIds` to POST /api/posts. Unattached uploads older than 24 hours are '
      + 'removed. Rate-limited to 60 per hour per user.',
    responses: {
      201: { description: 'Photo stored — `{ id, width, height }`' },
      400: { description: 'Missing photo' },
      413: { description: 'Over 4 MB, or too many pixels' },
      415: { description: 'Not a JPEG, PNG or WebP image (HEIC is not accepted)' },
      429: { description: 'Too many uploads' },
      500: { description: 'Internal server error' },
    },
  },
})

const ROUTE = 'POST /api/post-photos'
const STALE_AFTER_MS = 24 * 60 * 60 * 1000

export default defineEventHandler(async (event): Promise<{ id: string; width: number; height: number }> => {
  const userId = event.context.userId as string
  const log = event.context.logger ?? logger

  // The declared filename and content type are never used: the key is ours and
  // the format is sniffed from the bytes by processPostPhoto.
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'photo' && p.data?.length)
  if (!file) {
    throw createError({ statusCode: 400, statusMessage: 'Missing photo' })
  }

  let uploadedPath: string | null = null
  try {
    await rateLimitByKey(`post-photo:${userId}`, 60, '1 h')

    const processed = await processPostPhoto(file.data)

    // Opportunistic cleanup (no cron): the caller's own abandoned uploads.
    // Re-guarded on postId null so one attached meanwhile is never deleted.
    const stale = await prisma.postPhoto.findMany({
      where: { uploaderId: userId, postId: null, createdAt: { lt: new Date(Date.now() - STALE_AFTER_MS) } },
      select: { id: true, storagePath: true },
    })
    if (stale.length > 0) {
      await prisma.postPhoto.deleteMany({ where: { id: { in: stale.map((p) => p.id) }, postId: null } })
      await removePostPhotoObjects(stale.map((p) => p.storagePath), log, ROUTE)
    }

    const storagePath = postPhotoPath(userId, randomUUID())
    await uploadPostPhotoObject(storagePath, processed.data)
    uploadedPath = storagePath

    const photo = await prisma.postPhoto.create({
      data: { uploaderId: userId, storagePath, width: processed.width, height: processed.height },
      select: { id: true, width: true, height: true },
    })

    event.node.res.statusCode = 201
    return photo
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    // The object was stored but no row points at it: remove it rather than orphan it.
    if (uploadedPath) await removePostPhotoObjects([uploadedPath], log, ROUTE)
    log.error({ err: error, route: ROUTE }, `[${ROUTE}] Failed to upload photo`)
    throw createError({ statusCode: 500, statusMessage: 'Failed to upload photo' })
  }
})
