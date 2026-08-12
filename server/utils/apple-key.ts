/**
 * Classifies how a `NUXT_OAUTH_APPLE_PRIVATE_KEY` value is formatted, without
 * ever echoing the value itself.
 *
 * `jose.importPKCS8` rejects anything that is not raw PKCS#8 PEM with an opaque
 * `TypeError`, and `nuxt-auth-utils` then collapses that into
 * `Apple login failed: Unknown error`. Naming the *shape* of the mis-paste is
 * what turns that dead end into a one-line fix.
 *
 * Shared deliberately between the runtime handler (`server/api/auth/apple.ts`,
 * which logs the format on every request) and the offline probe
 * (`scripts/apple-oauth-probe.ts`) so both agree on the diagnosis.
 */

/** PKCS#8 PEM banner. `jose` requires this at index 0 — not merely present. */
const PKCS8_BANNER = '-----BEGIN PRIVATE KEY-----'
/** Closing armor line. Absent on a truncated paste, which jose also rejects. */
const PKCS8_FOOTER = '-----END PRIVATE KEY-----'

/**
 * True when an all-base64 value decodes to PEM text (someone base64-encoded the
 * whole .p8 file), false when it decodes to raw DER (someone copied the PEM's
 * body without its BEGIN/END armor). Both look identical from the outside but
 * need opposite fixes, so the first bytes decide.
 */
function decodesToPem(raw: string): boolean {
  try {
    // Only the first few bytes matter, and atob needs a length divisible by 4.
    const head = raw.replace(/\s/g, '').slice(0, 16)
    return atob(head).startsWith('-----')
  }
  catch {
    return false
  }
}

export type ApplePrivateKeyFormat =
  /** Unset or not a string. */
  | 'empty'
  /** Correct: raw PEM with real newlines. */
  | 'pkcs8'
  /** Correct: raw PEM with `\n` escapes, which the library expands before parsing. */
  | 'pkcs8-escaped-newlines'
  /** Wrapped in " or ' — a dotenv/Vercel paste artefact. */
  | 'quoted'
  /** A stray newline or space before the banner; jose checks index 0, so this fails. */
  | 'leading-whitespace'
  /** SEC1 ("BEGIN EC PRIVATE KEY"); needs converting to PKCS#8. */
  | 'sec1'
  /** PKCS#1 RSA — the wrong key entirely; Sign in with Apple keys are EC P-256. */
  | 'pkcs1'
  /** Base64 of the whole .p8 file — the `NUXT_APNS_PRIVATE_KEY` convention, applied to the wrong var. */
  | 'base64-blob'
  /** The PEM's base64 body with its BEGIN/END armor lines stripped off. */
  | 'pem-body-only'
  /** The PEM banner is present but its dashes are non-ASCII — macOS smart substitution. */
  | 'smart-punctuation'
  /** Rich Text Format — TextEdit re-saved the .p8 as RTF. */
  | 'rtf'
  /** A filesystem path to the .p8 rather than its contents. */
  | 'file-path'
  | 'unknown'

/**
 * Returns the format of an Apple private key value.
 *
 * Pure and allocation-light so it is safe to call on every request. The return
 * value is a fixed enum member and can never contain key material.
 */
export function classifyApplePrivateKey(raw: unknown): ApplePrivateKeyFormat {
  if (typeof raw !== 'string' || raw.length === 0) return 'empty'

  // Both the header AND the footer are required. A value truncated after the
  // banner — a partial paste, or a shell that ate everything past the first line
  // — would otherwise be called usable here and then fail inside importPKCS8
  // with the same opaque TypeError this function exists to replace. Falling
  // through leaves it as 'unknown', which carries remediation.
  if (raw.startsWith(PKCS8_BANNER) && raw.includes(PKCS8_FOOTER)) {
    return raw.includes('\\n') ? 'pkcs8-escaped-newlines' : 'pkcs8'
  }
  // Checked on the trimmed value: a space before the quote is still a quoting
  // problem, and would otherwise fall through to 'unknown'.
  if (/^["']/.test(raw.trim())) return 'quoted'
  if (/^\s|^﻿/.test(raw) && raw.replace(/^﻿/, '').trimStart().startsWith(PKCS8_BANNER)) {
    return 'leading-whitespace'
  }
  if (raw.startsWith('{\\rtf')) return 'rtf'
  if (raw.includes('-----BEGIN EC PRIVATE KEY-----')) return 'sec1'
  if (raw.includes('-----BEGIN RSA PRIVATE KEY-----')) return 'pkcs1'
  // A path to the key rather than the key. Checked before the punctuation test
  // because a path contains neither a banner nor base64-only characters.
  if (/^~?\/?[\w./~-]+\.p8$/.test(raw.trim())) return 'file-path'
  // macOS "smart dashes" rewrite the banner's ASCII hyphens as en/em dashes, so
  // the text still reads as a PEM but no longer matches byte for byte. Opening a
  // .p8 in TextEdit and copying out of it is the usual way this happens.
  if (/BEGIN\s+PRIVATE\s+KEY/i.test(raw) && /[‐-―‘’“”]/.test(raw)) {
    return 'smart-punctuation'
  }
  // Two different all-base64 mistakes reach here and need different fixes, so
  // decode far enough to tell them apart. The floor is well below a P-256 body
  // (~200 chars) to keep short junk out without excluding a real key.
  if (/^[A-Za-z0-9+/=\s]+$/.test(raw) && raw.replace(/\s/g, '').length >= 100) {
    return decodesToPem(raw) ? 'base64-blob' : 'pem-body-only'
  }

  return 'unknown'
}

/** Safe, redacted forensic summary of a key value that failed to classify. */
export interface ApplePrivateKeyForensics {
  length: number
  /** First 48 characters, JSON-escaped, with any long base64 run masked. */
  preview: string
  /** Hex code points of the first 8 characters — reveals BOMs and smart dashes. */
  firstCodePoints: string
  /** True when the text mentions a PEM banner even if it does not match byte for byte. */
  mentionsBanner: boolean
  hasNonAscii: boolean
  /** True when the value contains a literal backslash-n rather than a newline. */
  hasEscapedNewlines: boolean
  hasRealNewlines: boolean
  hasCarriageReturns: boolean
}

/**
 * Describes what a key value actually contains when `classifyApplePrivateKey`
 * cannot name it, so `unknown` stops being a dead end.
 *
 * SAFE TO PRINT: any run of 20+ base64 characters — i.e. anything that could be
 * key material — is replaced by a length marker before the preview is built. The
 * PEM banner, BOMs, quotes and paths are not secret, and those are what matter
 * here.
 */
export function describeApplePrivateKeyValue(raw: unknown): ApplePrivateKeyForensics {
  const value = typeof raw === 'string' ? raw : ''
  const masked = value.replace(/[A-Za-z0-9+/=]{20,}/g, (run) => `[…${run.length} base64 chars…]`)

  return {
    length: value.length,
    preview: JSON.stringify(masked.slice(0, 48)),
    firstCodePoints: [...value.slice(0, 8)]
      .map((char) => `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`)
      .join(' '),
    mentionsBanner: /BEGIN[\s\S]{0,4}PRIVATE[\s\S]{0,4}KEY/i.test(value),
    // eslint-disable-next-line no-control-regex
    hasNonAscii: /[^\x00-\x7F]/.test(value),
    hasEscapedNewlines: value.includes('\\n'),
    hasRealNewlines: value.includes('\n'),
    hasCarriageReturns: value.includes('\r'),
  }
}

/**
 * Actionable remediation for a key format, or `null` when the format is already
 * usable. Contains no key material — safe to log and safe to print.
 */
export function explainApplePrivateKeyFormat(format: ApplePrivateKeyFormat): string | null {
  switch (format) {
    case 'pkcs8':
    case 'pkcs8-escaped-newlines':
      return null
    case 'empty':
      return 'NUXT_OAUTH_APPLE_PRIVATE_KEY is unset or empty.'
    case 'quoted':
      return 'The value is wrapped in quotes. Vercel stores the raw value verbatim — remove the '
        + 'surrounding " or \' so the PEM banner is the very first character.'
    case 'leading-whitespace':
      return 'There is whitespace before "-----BEGIN PRIVATE KEY-----". jose requires the banner at '
        + 'index 0, so even a single leading newline fails. Trim it.'
    case 'sec1':
      return 'This is an SEC1 key ("BEGIN EC PRIVATE KEY"), but ES256 signing needs PKCS#8. Convert it: '
        + 'openssl pkcs8 -topk8 -nocrypt -in key.pem -out key.p8'
    case 'pkcs1':
      return 'This is an RSA key. A Sign in with Apple key is EC P-256 — the wrong file has been pasted.'
    case 'base64-blob':
      return 'The value is the whole .p8 base64-encoded. NUXT_APNS_PRIVATE_KEY is base64 by '
        + 'convention, but NUXT_OAUTH_APPLE_PRIVATE_KEY must be the RAW contents of the .p8 — use '
        + '`cat AuthKey_XXXXXXXXXX.p8`, not `base64 -i`.'
    case 'pem-body-only':
      return 'This is the PEM\'s base64 body with its "-----BEGIN PRIVATE KEY-----" and '
        + '"-----END PRIVATE KEY-----" lines stripped off. jose needs the full armored PEM, not '
        + 'just the body. Re-read the whole file instead of copying the middle of it: '
        + 'printf \'NUXT_OAUTH_APPLE_PRIVATE_KEY="%s"\\n\' "$(awk \'{printf "%s\\\\n", $0}\' AuthKey_XXXXXXXXXX.p8)"'
    case 'smart-punctuation':
      return 'The banner reads as a PEM but its dashes are non-ASCII — macOS "smart dashes" '
        + 'rewrote them, which happens when a .p8 is opened in TextEdit and copied out. '
        + 'Re-read the file directly instead: '
        + 'printf \'NUXT_OAUTH_APPLE_PRIVATE_KEY="%s"\\n\' "$(awk \'{printf "%s\\\\n", $0}\' AuthKey_XXXXXXXXXX.p8)"'
    case 'rtf':
      return 'This is Rich Text Format, not a key — TextEdit re-saved the .p8 as RTF. '
        + 'Apple only lets you download a Sign in with Apple key once, so if the original '
        + 'file was overwritten you must revoke the key and generate a new one.'
    case 'file-path':
      return 'This is a path to the .p8, not its contents. The variable must hold the key '
        + 'itself: use `cat AuthKey_XXXXXXXXXX.p8`, not the filename.'
    case 'unknown':
      // Deliberately does not suggest printing the value: any slice of it is key
      // material. The accompanying privateKeyForensics field reports length,
      // banner presence and newline style with base64 runs masked.
      return 'The value has no complete PEM armor, so it is not a usable private key. It must '
        + 'start with "-----BEGIN PRIVATE KEY-----" and contain the matching END line. See the '
        + 'privateKeyForensics field on the apple.oauth.config log line for what it does hold.'
  }
}
