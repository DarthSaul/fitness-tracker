import sharp from 'sharp'

/**
 * Post photo processing (docs/social/SPEC-post-photos.md).
 *
 * Every upload is re-encoded before anything is stored, so the stored file
 * carries NO metadata — no EXIF, so no GPS location — and only pixels this
 * pipeline produced. Clients downscale before uploading (Vercel caps a request
 * body at 4.5 MB); this is the server's own guarantee, not a trust in theirs.
 */

/** Per-upload cap, below Vercel's 4.5 MB request body limit. */
export const POST_PHOTO_MAX_BYTES = 4 * 1024 * 1024
/** Long-edge cap for stored photos. */
export const POST_PHOTO_MAX_EDGE = 2048
/** Decoded-size cap: rejects decompression bombs (tiny files that decode huge). */
export const POST_PHOTO_MAX_PIXELS = 50_000_000

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp'])

export interface ProcessedPhoto {
  data: Buffer
  width: number
  height: number
}

/**
 * Validate an upload by decoding it, then fix orientation, strip all metadata,
 * downscale to {@link POST_PHOTO_MAX_EDGE} and re-encode as JPEG.
 * @throws {H3Error} 413 over the byte or pixel cap · 415 not a JPEG, PNG or WebP.
 */
export async function processPostPhoto(input: Buffer): Promise<ProcessedPhoto> {
  if (input.length > POST_PHOTO_MAX_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Photo must be 4 MB or smaller' })
  }

  // The format comes from the bytes, never from the declared content type.
  const meta = await sharp(input).metadata().catch(() => {
    throw createError({ statusCode: 415, statusMessage: 'Photo must be a JPEG, PNG or WebP image' })
  })
  if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) {
    // HEIC/AVIF report "heif": sharp's prebuilt binaries can't decode HEVC, so
    // the client must convert to JPEG.
    throw createError({ statusCode: 415, statusMessage: 'Photo must be a JPEG, PNG or WebP image' })
  }
  if ((meta.width ?? 0) * (meta.height ?? 0) > POST_PHOTO_MAX_PIXELS) {
    throw createError({ statusCode: 413, statusMessage: 'Photo dimensions are too large' })
  }

  // .rotate() bakes the EXIF orientation into the pixels; sharp then writes no
  // metadata because withMetadata()/keepExif() are never called.
  const { data, info } = await sharp(input, { limitInputPixels: POST_PHOTO_MAX_PIXELS })
    .rotate()
    .resize({ width: POST_PHOTO_MAX_EDGE, height: POST_PHOTO_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })

  return { data, width: info.width, height: info.height }
}
