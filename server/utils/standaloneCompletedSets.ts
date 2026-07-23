import type { H3Event } from 'h3'
import type { StandaloneCompletedSet } from '@prisma/client'

/**
 * Loads a completed set scoped to a standalone workout session, enforcing the
 * guard sequence shared by the set mutation routes (PATCH/DELETE
 * /api/standalone-workout-sessions/:id/sets/:setId):
 *
 *  - 404 'Session not found' when the session does not exist
 *  - 404 'Not Found' when the session belongs to another user
 *  - 404 'Completed set not found' when the set is missing or belongs to a
 *    different session
 *
 * There is intentionally no session-status guard: like program workout
 * sessions, completed-set mutations are allowed on COMPLETED sessions so
 * history can be corrected.
 */
export async function findOwnedStandaloneCompletedSet(
  sessionId: string,
  setId: string,
  userId: string,
): Promise<StandaloneCompletedSet> {
  const session = await prisma.standaloneWorkoutSession.findUnique({
    where: { id: sessionId },
  })

  if (!session) {
    throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  }

  if (session.userId !== userId) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const completedSet = await prisma.standaloneCompletedSet.findFirst({
    where: { id: setId, standaloneWorkoutSessionId: sessionId },
  })

  if (!completedSet) {
    throw createError({ statusCode: 404, statusMessage: 'Completed set not found' })
  }

  return completedSet
}

/**
 * Maps an error thrown during a completed-set mutation to its HTTP response:
 * re-throws H3 errors untouched, converts the Prisma P2025 concurrent-delete
 * race to a 404 (the row vanished between the scoped lookup and the write),
 * and logs + wraps anything else as a 500 with the given message.
 */
export function throwStandaloneCompletedSetMutationError(
  event: H3Event,
  error: unknown,
  route: string,
  failureMessage: string,
): never {
  if ((error as { statusCode?: number }).statusCode) throw error
  if ((error as { code?: string }).code === 'P2025') {
    throw createError({ statusCode: 404, statusMessage: 'Completed set not found' })
  }
  ;(event.context.logger ?? logger).error({ err: error, route }, `[${route}] ${failureMessage}`)
  throw createError({ statusCode: 500, statusMessage: failureMessage })
}
