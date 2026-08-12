import {
  classifyApplePrivateKey,
  describeApplePrivateKeyValue,
  explainApplePrivateKeyFormat,
} from '../../utils/apple-key'
import { reportOAuthFailure } from '../../utils/oauth-error'

defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Apple OAuth login',
    description: 'Handles Apple OAuth flow (GET redirect + POST callback via form_post). On success, upserts the user and establishes a session, then redirects to /home.',
    responses: {
      302: {
        description: 'Redirects to Apple OAuth consent screen or to / after successful login',
      },
    },
  },
})

/** The `user` field Apple form-posts back, once normalised. */
interface AppleUserProfile {
  name?: { firstName?: string; lastName?: string }
  email?: string
}

/**
 * Normalises Apple's `user` field, which has two shapes plus an absence:
 *
 *  - **Missing entirely** on every sign-in after the first. Apple sends `user`
 *    only with the initial authorization, so `user` is `undefined` thereafter.
 *    Reading `user.name` then throws a TypeError — and because it happened
 *    before the try block, it escaped `onError` and 500'd the callback. That was
 *    the production failure this function exists to prevent.
 *  - **A JSON string** on the first sign-in. The callback is
 *    `application/x-www-form-urlencoded`, so `readBody` yields the raw string
 *    `{"name":{"firstName":"Jane",…}}`, not an object. `user.name` on a string
 *    is `undefined`, so the name was silently dropped — no crash, just a User
 *    row that never got a name.
 *  - An object, if a future library version parses it for us.
 */
function readAppleUser(raw: unknown): AppleUserProfile {
  if (!raw) return {}

  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw)
      return typeof parsed === 'object' && parsed !== null ? (parsed as AppleUserProfile) : {}
    }
    catch {
      // Malformed JSON from the body is not worth failing a sign-in over; the
      // email still comes from the verified id_token.
      return {}
    }
  }

  return typeof raw === 'object' ? (raw as AppleUserProfile) : {}
}

/** Upper bound on a name part, matching the longest plausible legal given name. */
const MAX_NAME_PART = 64

/**
 * Accepts a name part only if it is a non-empty trimmed string of sane length.
 *
 * The `user` field is body data, so its `name` can be any JSON value — a number,
 * an object, or a megabyte of text. Anything unusable is ignored rather than
 * failing the sign-in, since the name is cosmetic and the email is what matters.
 */
function readNamePart(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= MAX_NAME_PART ? trimmed : null
}

/**
 * Builds the post-failure redirect, tagging it with the requestId so a user's
 * screenshot of `/login` maps to exactly one `oauth.failure` log line.
 */
function failureRedirect(code: string, requestId: string): string {
  return requestId
    ? `/login?error=${code}&rid=${encodeURIComponent(requestId)}`
    : `/login?error=${code}`
}

/**
 * Config shape expected by nuxt-auth-utils, derived from the auto-imported
 * function rather than restated. Extracting the object literal out of the
 * `defineOAuthAppleEventHandler(...)` call site loses the contextual typing that
 * gave `onSuccess`/`onError` their parameter types, so it is reapplied here.
 */
type AppleOAuthHandlerConfig = Parameters<typeof defineOAuthAppleEventHandler>[0]

/**
 * The OAuth config. Exported by name so it stays independently unit-testable
 * now that the default export is a per-request wrapper (see below).
 */
export const appleOAuthConfig: AppleOAuthHandlerConfig = {
  config: {
    scope: ['name', 'email'],
  },
  /**
   * Upserts the authenticated user in the database and establishes a server session.
   * Name is only populated on the first login; email is read from the JWT payload on every login.
   */
  async onSuccess(event, { user, payload }) {
    // Everything is inside the try: `user` comes straight off the request body,
    // so any assumption about its shape is a 500 waiting to happen. A throw out
    // here would bypass onError entirely and surface as an unhandled error.
    try {
      // ONLY the id_token's verified claim may be used here. findOrLinkUser
      // links accounts by email and documents that the caller must have verified
      // it with the provider; `user` is form-post body data, so falling back to
      // its email would let anyone holding a valid code link into an arbitrary
      // account. Apple puts email in the id_token on every login, so there is
      // nothing to gain from the fallback either.
      const email = payload.email
      if (!email) {
        return sendRedirect(event, '/login?error=apple_no_email')
      }

      const appleUser = readAppleUser(user)
      const firstName = readNamePart(appleUser.name?.firstName)
      const lastName = readNamePart(appleUser.name?.lastName)
      const name = [firstName, lastName].filter(Boolean).join(' ') || null

      const dbUser = await findOrLinkUser({
        provider: 'apple',
        providerId: payload.sub,
        email,
        // Apple only sends name on the very first login. Pass undefined (not null) on
        // subsequent logins so findOrLinkUser doesn't overwrite an existing name.
        name: name ?? undefined,
      })

      await setUserSession(event, {
        user: {
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          avatarUrl: dbUser.avatarUrl,
        },
      })

      return sendRedirect(event, '/home')
    }
    catch (error) {
      const requestId = reportOAuthFailure(event, 'apple', 'upsert', error)
      return sendRedirect(event, failureRedirect('apple_failed', requestId))
    }
  },
  /** Logs the real cause, reports it to Sentry, and redirects with a correlation id. */
  onError(event, error) {
    const requestId = reportOAuthFailure(event, 'apple', 'callback', error)
    return sendRedirect(event, failureRedirect('apple_failed', requestId))
  },
}

/**
 * Wrapped per request for two reasons.
 *
 * 1. `redirectURL` asymmetry in nuxt-auth-utils: the authorize step falls back
 *    to `getOAuthRedirectURL(event)` when `config.redirectURL` is empty, but the
 *    token exchange sends `redirect_uri: config.redirectURL` with NO fallback,
 *    and `redirectURL` is excluded from the library's missing-config check. An
 *    empty value therefore yields a perfectly normal Apple consent screen
 *    followed by a guaranteed `invalid_grant` — an exact match for the symptom
 *    this route was failing with. Supplying the value ourselves makes the
 *    authorize-step and exchange-step `redirect_uri` provably identical.
 *
 * 2. `runtimeConfig.public.appleAuthEnabled` is computed at BUILD time, so it
 *    cannot see the runtime environment. The log line below is the only thing
 *    that can prove or disprove a build-vs-runtime env divergence.
 *
 * One closure per request is free next to a network round trip to Apple.
 */
export default defineEventHandler(async (event) => {
  // First statement, per CLAUDE.md — this is an unauthenticated, internet-facing
  // auth route, and the callback leg performs a token exchange with Apple.
  // No-ops when Upstash is not configured.
  await rateLimitByIp(event)

  const apple = useRuntimeConfig(event).oauth?.apple as Record<string, unknown> | undefined
  const configured = typeof apple?.redirectURL === 'string' ? apple.redirectURL : ''
  const redirectURL = configured || `${getRequestURL(event).origin}/api/auth/apple`

  // A malformed .p8 is the single most common cause of `apple_failed`, and
  // jose's TypeError says nothing useful about it. Naming the format — and, when
  // it is wrong, what the value actually looks like — turns that into a one-line
  // fix. Only emitted on a bad format, and the forensics mask key material.
  const privateKeyFormat = classifyApplePrivateKey(apple?.privateKey)
  const privateKeyProblem = explainApplePrivateKeyFormat(privateKeyFormat)

  // `typeof` is logged because Nitro's applyEnv runs every env value through
  // `destr`: an all-digit KEY_ID or TEAM_ID silently becomes a number, which
  // Apple rejects as invalid_client. Values are never logged — only presence,
  // type, length and the key's format classification.
  //
  // A healthy configuration has nothing to diagnose, so it goes to `debug` and
  // stays out of production logs (pino runs at `info` there). Anything actually
  // wrong — a bad key format, or a redirect URL we had to synthesise — is
  // promoted to `info` so it surfaces without a redeploy.
  const misconfigured = Boolean(privateKeyProblem) || !configured
  const log = event.context.logger ?? logger
  ;(misconfigured ? log.info : log.debug).call(
    log,
    {
      route: '/api/auth/apple',
      method: event.method,
      requestId: event.context.requestId,
      clientIdSet: Boolean(apple?.clientId),
      clientIdType: typeof apple?.clientId,
      teamIdSet: Boolean(apple?.teamId),
      teamIdType: typeof apple?.teamId,
      keyIdSet: Boolean(apple?.keyId),
      keyIdType: typeof apple?.keyId,
      privateKeySet: Boolean(apple?.privateKey),
      privateKeyLength: typeof apple?.privateKey === 'string' ? apple.privateKey.length : 0,
      privateKeyFormat,
      ...(privateKeyProblem
        ? {
            privateKeyProblem,
            privateKeyForensics: describeApplePrivateKeyValue(apple?.privateKey),
          }
        : {}),
      redirectURLSet: Boolean(configured),
      // Public: Apple shows it and the browser sees it in the authorize URL.
      effectiveRedirectURL: redirectURL,
      // True means NUXT_OAUTH_APPLE_REDIRECT_URL is missing at runtime and we
      // are papering over it — worth fixing even though the flow now works.
      redirectURLFromRequestHost: !configured,
    },
    'apple.oauth.config',
  )

  return defineOAuthAppleEventHandler({
    ...appleOAuthConfig,
    config: { ...appleOAuthConfig.config, redirectURL },
  })(event)
})
