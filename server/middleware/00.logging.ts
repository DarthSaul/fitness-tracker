/**
 * Request-lifecycle logging. Runs before auth (alphabetical ordering puts
 * `00.logging.ts` ahead of `auth.ts`) so failed-auth requests still emit a log
 * line. Generates the request ID that downstream middleware/handlers read from
 * `event.context.requestId`.
 */
export default defineEventHandler((event) => {
  const requestId = crypto.randomUUID()
  const start = Date.now()

  event.context.requestId = requestId
  event.context.logger = logger.child({ requestId })

  event.node.res.on('finish', () => {
    event.context.logger.info(
      {
        method: event.method,
        path: event.path,
        statusCode: event.node.res.statusCode,
        durationMs: Date.now() - start,
        userId: event.context.userId,
        // Best-effort, UNVERIFIED id set by auth.ts on a failed Bearer verify
        // (token expired/invalid). Present only on 401s; never trust for authz.
        unverifiedUserId: event.context.unverifiedUserId,
        authMethod: event.context.authMethod,
      },
      'request.complete',
    )
  })
})
