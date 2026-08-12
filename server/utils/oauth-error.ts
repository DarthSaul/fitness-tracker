import type { H3Event } from 'h3'
import * as Sentry from '@sentry/nuxt'

/**
 * Short discriminator naming the actual cause of an OAuth failure.
 *
 * This is the field to filter Vercel logs and Sentry on: stable,
 * low-cardinality, and mapping one-to-one onto a remediation.
 */
export type OAuthFailureCause =
  /** One of the five NUXT_OAUTH_APPLE_* vars is empty at RUNTIME. */
  | 'missing_config'
  /** Apple rejected the client secret — clientId/teamId/keyId/key mismatch. */
  | 'apple_invalid_client'
  /** Credentials fine; the code or the redirect_uri is wrong. */
  | 'apple_invalid_grant'
  /** Malformed token request — most often an empty redirect_uri. */
  | 'apple_invalid_request'
  /** Some other OAuth 2.0 `error` code from the provider. */
  | 'apple_oauth_error'
  /** Non-2xx from the token endpoint with no parseable OAuth body. */
  | 'token_endpoint_http'
  /** The .p8 is not raw PKCS#8 PEM. */
  | 'bad_private_key'
  /** The token endpoint answered with an error body and no id_token. */
  | 'id_token_missing'
  | 'id_token_audience'
  | 'id_token_issuer'
  | 'id_token_expired'
  | 'id_token_signature'
  /** appleid.apple.com/auth/keys unreachable or unusable. */
  | 'jwks_unavailable'
  | 'jose_error'
  /** Prisma failure in findOrLinkUser / session persistence. */
  | 'db_error'
  | 'network'
  | 'unknown'

/**
 * Flat, JSON-safe, secret-free description of an OAuth failure.
 * Every field is an allow-listed primitive.
 */
export interface OAuthErrorDetail {
  cause: OAuthFailureCause
  /** Innermost error's constructor or `name`, e.g. 'FetchError'. */
  errorName: string
  /** Innermost message, truncated. */
  message: string
  /** H3Error.statusCode — nuxt-auth-utils stamps 401 on OAuth failures, 500 on missing config. */
  statusCode?: number
  /** HTTP status of the upstream token request. */
  httpStatus?: number
  httpStatusText?: string
  /** Upstream target, origin + path only; any query string is stripped. */
  httpUrl?: string
  /** The OAuth 2.0 `error` from the provider's JSON body — the field the raw log loses. */
  oauthError?: string
  oauthErrorDescription?: string
  /** jose error code, e.g. 'ERR_JWT_CLAIM_VALIDATION_FAILED'. */
  joseCode?: string
  joseClaim?: string
  joseReason?: string
  /** Prisma error code, e.g. 'P2002'. */
  prismaCode?: string
  /** Node/undici code, e.g. 'ENOTFOUND'. */
  networkCode?: string
}

const MAX_MESSAGE = 300

type Dict = Record<string, unknown>

function asDict(value: unknown): Dict | null {
  return typeof value === 'object' && value !== null ? (value as Dict) : null
}

function asString(value: unknown, max = MAX_MESSAGE): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Mirrors pino's own `isErrorLike`, so we unwrap exactly what the serializer would. */
function isErrorish(value: unknown): boolean {
  const dict = asDict(value)
  return dict !== null && typeof dict.message === 'string'
}

function nameOf(value: unknown): string {
  const dict = asDict(value)
  if (!dict) return typeof value
  const ctorName = (value as object).constructor?.name
  if (ctorName && ctorName !== 'Object') return ctorName
  return asString(dict.name, 64) ?? 'Object'
}

/**
 * H3Error duck-type.
 *
 * Deliberately not h3's `isError()`, which tests `constructor.__h3_error__` and
 * silently fails across duplicated h3 copies. The structural fallback has to
 * distinguish an H3Error from an ofetch FetchError, which also exposes
 * `statusCode` — but only as an alias of its own `status` getter.
 */
function isH3ErrorLike(dict: Dict): boolean {
  const ctor = (dict as { constructor?: { __h3_error__?: boolean } }).constructor
  if (ctor?.__h3_error__ === true) return true
  return typeof dict.statusCode === 'number' && typeof dict.status !== 'number'
}

/** Reads an OAuth 2.0 error body. Strings only, so a nested object cannot smuggle anything in. */
function readOAuthBody(body: unknown, detail: OAuthErrorDetail): void {
  const dict = asDict(body)
  if (!dict) return
  detail.oauthError ??= asString(dict.error, 64)
  detail.oauthErrorDescription ??= asString(dict.error_description, 200)
}

/**
 * `err.request` is the first argument passed to $fetch. Only a plain string is
 * accepted (never a Request object, never `err.options`), and the query string
 * is stripped in case a provider ever carries credentials there.
 */
function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return asString(value.split('?')[0], 200)
}

/** Credential-bearing parameter names that must never reach a log line. */
const SENSITIVE_PARAM_RE
  = /\b(client_secret|code|refresh_token|access_token|id_token|assertion)=[^\s&"']+/gi

/**
 * Removes credentials that a provider library may have baked into an error
 * message. ofetch's `createFetchError` interpolates the full request URL —
 * query string included — into `message`, so a provider that carried the
 * authorization code in the query would leak it here even though every
 * structured field is allow-listed.
 */
function scrubMessage(message: string): string {
  return message
    // Strip the query string from any URL, keeping the origin + path.
    .replace(/(https?:\/\/[^\s"']+?)\?[^\s"']*/gi, '$1')
    // Belt and braces for credentials outside a URL.
    .replace(SENSITIVE_PARAM_RE, '$1=[REDACTED]')
}

const PRIVATE_KEY_MESSAGE_RE
  = /pkcs#?8|must be pkcs|BEGIN (EC |RSA )?PRIVATE KEY|Invalid PKCS|Expected (version field|algorithm identifier|algorithm OID|curve OID)|Unsupported (key algorithm|named curve)|Invalid keyData|DataError/i

/**
 * Flattens an unknown OAuth failure into a small, JSON-safe, secret-free record.
 *
 * Why this exists: nuxt-auth-utils funnels every token-exchange failure through
 * `handleAccessTokenErrorResponse`, whose message is built from
 * `error.error_description || error.error || 'Unknown error'`. A *thrown* ofetch
 * FetchError or jose error has neither field, so the message is ALWAYS literally
 * "Apple login failed: Unknown error". Worse, ofetch defines `.data`, `.status`,
 * `.statusText`, `.response` and `.request` as NON-ENUMERABLE getters
 * (`createFetchError`, ofetch 1.5.1), and pino's standard error serializer walks
 * errors with `for (const key in err)` — so the provider's actual JSON body
 * (`{"error":"invalid_client"}`) is silently dropped on the way to the log.
 * Every field below is therefore read by explicit property access.
 *
 * REDACTION — allow-list only; this function never enumerates:
 *  - `err.options` is never touched. It holds the URL-encoded token-request
 *    body: the minted client secret JWT AND the authorization `code`.
 *  - `err.request` is read only when it is a plain string, query stripped.
 *  - a jose `payload`/`cause` is never copied — on a claim-validation failure
 *    that is the end user's verified id_token (sub, email).
 *  - the private key never appears on any error object read here.
 */
export function extractOAuthErrorDetail(error: unknown): OAuthErrorDetail {
  const detail: OAuthErrorDetail = { cause: 'unknown', errorName: nameOf(error), message: '' }

  const root = asDict(error)
  if (!root) {
    detail.message = asString(String(error ?? ''), 120) ?? ''
    detail.cause = deriveCause(detail)
    return detail
  }

  // Layer 1 — the H3Error that handleAccessTokenErrorResponse builds.
  let inner: unknown = error
  if (isH3ErrorLike(root)) {
    detail.statusCode = asNumber(root.statusCode)
    // `data` holds either the original throw or an OAuth body directly.
    if (isErrorish(root.data) && root.data !== error) inner = root.data
    else readOAuthBody(root.data, detail)
  }

  const dict = asDict(inner) ?? root
  detail.errorName = nameOf(inner)
  detail.message = scrubMessage(asString(dict.message) ?? '')

  // Layer 2 — ofetch FetchError. These are non-enumerable getters; read them.
  detail.httpStatus = asNumber(dict.status)
  detail.httpStatusText = asString(dict.statusText, 64)
  detail.httpUrl = safeUrl(dict.request)
  readOAuthBody(dict.data, detail) // the provider's parsed JSON body
  const response = asDict(dict.response)
  if (response) readOAuthBody(response._data, detail) // pre-parse fallback

  // Layer 3 — coded errors: jose, Prisma, Node/undici. Order matters.
  const code = asString(dict.code, 64)
  if (code) {
    if (/^P\d{4}$/.test(code)) {
      detail.prismaCode = code
    }
    else if (code.startsWith('ERR_J')) { // ERR_JOSE_*, ERR_JW*
      detail.joseCode = code
      detail.joseClaim = asString(dict.claim, 32)
      detail.joseReason = asString(dict.reason, 32)
    }
    else {
      detail.networkCode = code
    }
  }

  detail.cause = deriveCause(detail)
  return detail
}

/** Maps the extracted fields onto a single remediation-bearing cause. */
function deriveCause(d: OAuthErrorDetail): OAuthFailureCause {
  if (d.statusCode === 500 && /^Missing NUXT_OAUTH_/.test(d.message)) return 'missing_config'

  if (d.oauthError) {
    if (d.oauthError === 'invalid_client') return 'apple_invalid_client'
    if (d.oauthError === 'invalid_grant') return 'apple_invalid_grant'
    if (d.oauthError === 'invalid_request') return 'apple_invalid_request'
    return 'apple_oauth_error'
  }

  if (d.joseCode) {
    switch (d.joseCode) {
      case 'ERR_JWS_INVALID':
      case 'ERR_JWT_INVALID':
        // jose throws this when the token argument is not a string. Here that
        // means requestAccessToken swallowed a 401 and returned the provider's
        // error body as the token response, so `id_token` is undefined. It is
        // NOT a malformed id_token from Apple — different remediation.
        return /must be a string|Invalid Compact JWS/i.test(d.message)
          ? 'id_token_missing'
          : 'jose_error'
      case 'ERR_JWT_CLAIM_VALIDATION_FAILED':
        if (d.joseClaim === 'aud') return 'id_token_audience'
        if (d.joseClaim === 'iss') return 'id_token_issuer'
        return 'jose_error'
      case 'ERR_JWT_EXPIRED': return 'id_token_expired'
      case 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED': return 'id_token_signature'
      case 'ERR_JWK_INVALID': return 'bad_private_key'
      case 'ERR_JWKS_NO_MATCHING_KEY':
      case 'ERR_JWKS_INVALID':
      case 'ERR_JWKS_TIMEOUT':
      case 'ERR_JWKS_MULTIPLE_MATCHING_KEYS': return 'jwks_unavailable'
      default: return 'jose_error'
    }
  }

  // jose's importPKCS8 rejects a non-PEM string with a plain TypeError, and its
  // ASN.1 reader throws plain Errors — neither carries a `code`.
  if (PRIVATE_KEY_MESSAGE_RE.test(d.message)) return 'bad_private_key'

  if (d.prismaCode) return 'db_error'
  if (d.networkCode) return 'network'
  if (d.httpStatus !== undefined) return 'token_endpoint_http'
  return 'unknown'
}

/**
 * Logs an OAuth failure with a machine-filterable `cause` and reports it to
 * Sentry. Returns the requestId so the caller can tag the redirect with it.
 *
 * Sentry: `sentry.server.config.ts`'s `beforeSend` drops `statusCode === 401`,
 * which is exactly what `handleAccessTokenErrorResponse` stamps on EVERY OAuth
 * failure. That filter exists deliberately for routine iOS access-token expiry
 * (CLAUDE.md: "do not 'fix' these by capturing them"), so it is left untouched.
 * Instead we capture a synthetic Error carrying no `statusCode` at all —
 * `isExpectedClientError` returns false for it, so the report flows through
 * while the 401 rule keeps working. Precedent: `server/middleware/auth.ts`
 * already calls `Sentry.captureException` directly for its misconfig branch.
 */
export function reportOAuthFailure(
  event: H3Event,
  provider: 'apple' | 'google',
  stage: 'callback' | 'upsert',
  error: unknown,
): string {
  const detail = extractOAuthErrorDetail(error)
  const requestId = (event.context.requestId as string | undefined) ?? ''

  // `err` is kept alongside the flat detail so the stack survives; `cause` is
  // hoisted to the top level because that is the field you filter logs on.
  ;(event.context.logger ?? logger).error(
    {
      err: error,
      provider,
      stage,
      cause: detail.cause,
      oauth: detail,
      requestId,
      route: `/api/auth/${provider}`,
    },
    'oauth.failure',
  )

  const synthetic = new Error(`${provider} oauth failed: ${detail.cause}`)
  synthetic.name = 'OAuthFailure'
  Sentry.captureException(synthetic, {
    tags: { oauth_provider: provider, oauth_stage: stage, oauth_cause: detail.cause },
    extra: { ...detail, requestId },
  })

  return requestId
}
