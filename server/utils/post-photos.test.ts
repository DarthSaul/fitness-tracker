/**
 * The processing pipeline runs on REAL image bytes — sharp is not mocked —
 * because "no GPS leaves the server" is a property of the actual encoder.
 */
import { describe, test, expect } from 'vitest'
import sharp from 'sharp'

import { processPostPhoto, isPhotoInputError, POST_PHOTO_MAX_BYTES } from './post-photos'

// GPS tag id 0x8825 (GPSInfo IFD pointer), in either byte order.
const hasGpsTag = (exif: Buffer | undefined) =>
  !!exif && (exif.includes(Buffer.from([0x88, 0x25])) || exif.includes(Buffer.from([0x25, 0x88])))

function solid(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: '#c33' } })
}

/** A phone-like JPEG: EXIF orientation 6 (rotate 90° to display) plus GPS coordinates. */
async function phoneJpegWithGps(width = 120, height = 60): Promise<Buffer> {
  return solid(width, height)
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '0/1 7/1 0/1' } })
    .toBuffer()
}

describe('processPostPhoto', () => {
  test('the fixture really does carry GPS EXIF and an orientation flag (guards the tests below)', async () => {
    const meta = await sharp(await phoneJpegWithGps()).metadata()
    expect(hasGpsTag(meta.exif)).toBe(true)
    expect(meta.orientation).toBe(6)
  })

  test('strips ALL metadata — no EXIF (so no GPS), no ICC, no XMP', async () => {
    const out = await processPostPhoto(await phoneJpegWithGps())

    const meta = await sharp(out.data).metadata()
    expect(meta.exif).toBeUndefined()
    expect(hasGpsTag(out.data)).toBe(false)
    expect(meta.icc).toBeUndefined()
    expect(meta.xmp).toBeUndefined()
  })

  test('applies the EXIF orientation to the pixels, so the photo is stored upright', async () => {
    const out = await processPostPhoto(await phoneJpegWithGps(120, 60))

    expect({ width: out.width, height: out.height }).toEqual({ width: 60, height: 120 })
    expect((await sharp(out.data).metadata()).orientation).toBeUndefined()
  })

  test('downscales to at most 2048px on the long edge, keeping the aspect ratio', async () => {
    const out = await processPostPhoto(await solid(4000, 3000).jpeg().toBuffer())

    expect({ width: out.width, height: out.height }).toEqual({ width: 2048, height: 1536 })
  })

  test('never enlarges a small photo', async () => {
    const out = await processPostPhoto(await solid(300, 200).jpeg().toBuffer())

    expect({ width: out.width, height: out.height }).toEqual({ width: 300, height: 200 })
  })

  test.each([
    ['PNG', () => solid(64, 64).png().toBuffer()],
    ['WebP', () => solid(64, 64).webp().toBuffer()],
  ])('accepts %s and stores it as JPEG', async (_label, make) => {
    const out = await processPostPhoto(await make())

    expect((await sharp(out.data).metadata()).format).toBe('jpeg')
  })

  test('reports the stored (processed) dimensions and bytes', async () => {
    const out = await processPostPhoto(await solid(100, 50).jpeg().toBuffer())

    const meta = await sharp(out.data).metadata()
    expect({ width: out.width, height: out.height }).toEqual({ width: meta.width, height: meta.height })
    expect(out.data.length).toBeGreaterThan(0)
  })

  test('413 for an upload over 4 MB, before decoding it', async () => {
    const oversized = Buffer.alloc(POST_PHOTO_MAX_BYTES + 1)
    await expect(processPostPhoto(oversized)).rejects.toMatchObject({ statusCode: 413 })
  })

  test('413 for a small file that decodes to too many pixels (decompression bomb)', async () => {
    // ~51 MP, but a single-colour PNG compresses to a few KB.
    const bomb = await sharp({ create: { width: 7200, height: 7100, channels: 3, background: '#000' } }).png().toBuffer()
    expect(bomb.length).toBeLessThan(POST_PHOTO_MAX_BYTES)

    await expect(processPostPhoto(bomb)).rejects.toMatchObject({ statusCode: 413 })
  })

  test('415 for a non-image, whatever it claims to be (the type is sniffed from the bytes)', async () => {
    await expect(processPostPhoto(Buffer.from('definitely a jpeg, trust me'))).rejects.toMatchObject({ statusCode: 415 })
  })

  test('415 for a HEIF-container image (HEIC/AVIF) — iOS must send JPEG', async () => {
    const avif = await solid(64, 64).avif().toBuffer()
    expect((await sharp(avif).metadata()).format).toBe('heif')

    await expect(processPostPhoto(avif)).rejects.toMatchObject({ statusCode: 415 })
  })

  test('415 for a decodable but unsupported format (GIF)', async () => {
    const gif = await solid(32, 32).gif().toBuffer()
    await expect(processPostPhoto(gif)).rejects.toMatchObject({ statusCode: 415 })
  })

  // Regression (PR #138 review): a valid header passes metadata() and the format
  // check, then the pixels fail to decode. That is a bad upload (415), not a
  // server fault (500 → Sentry).
  test('415 for a JPEG with a valid header but corrupt pixel data', async () => {
    const good = await solid(400, 300).jpeg().toBuffer()
    const sos = good.indexOf(Buffer.from([0xff, 0xda])) // start-of-scan: header ends here
    const corrupt = good.subarray(0, sos + 40)
    expect((await sharp(corrupt).metadata()).format).toBe('jpeg') // the header really is valid

    await expect(processPostPhoto(corrupt)).rejects.toMatchObject({ statusCode: 415 })
  })

  test('415 for a PNG with a valid header but truncated pixel data', async () => {
    const png = await solid(400, 300).png().toBuffer()
    const corrupt = png.subarray(0, Math.floor(png.length * 0.6))
    expect((await sharp(corrupt).metadata()).format).toBe('png')

    await expect(processPostPhoto(corrupt)).rejects.toMatchObject({ statusCode: 415 })
  })
})

describe('isPhotoInputError — what counts as a bad upload rather than a server fault', () => {
  test.each([
    'VipsJpeg: premature end of JPEG image',
    'vipspng: libpng read error',
    'Input buffer has corrupt header: webp: unable to parse image',
    'VipsForeignLoad: buffer is not in a known format',
  ])('decoder error %j → input error', (message) => {
    expect(isPhotoInputError(new Error(message))).toBe(true)
  })

  test.each([
    'Cannot allocate memory',
    'ENOSPC: no space left on device',
    'vips_threadpool: unable to create thread',
  ])('server fault %j → not an input error (stays a 500)', (message) => {
    expect(isPhotoInputError(new Error(message))).toBe(false)
  })

  test('non-Error values are not input errors', () => {
    expect(isPhotoInputError('VipsJpeg: premature end')).toBe(false)
    expect(isPhotoInputError(undefined)).toBe(false)
  })
})
