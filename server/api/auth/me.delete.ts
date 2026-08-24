defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Delete account',
    description:
      'Permanently deletes the authenticated user and all associated data: identities, refresh tokens, '
      + 'device tokens, saved programs, workout history, PT routines, notes and feedback (database rows '
      + 'cascade from the User record). For email/password identities the Supabase Auth user is deleted '
      + 'first, and feedback screenshots are removed from storage. Required for App Store account-deletion '
      + 'compliance (Guideline 5.1.1(v)). Web clients get their session cookie cleared; native clients '
      + 'should discard their JWT pair — the refresh tokens are already gone.',
    responses: {
      200: { description: 'Account deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
      401: { description: 'Unauthorized' },
      404: { description: 'User not found' },
      500: { description: 'Deletion failed — always safe to retry. Deletion may have partly completed (external auth cleanup is not rolled back); a retry resumes and finishes it. The account row and session remain until the final database delete succeeds.' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        identities: { select: { provider: true, providerId: true } },
        feedback: { select: { screenshotPath: true } },
      },
    })
    if (!user) {
      throw createError({ statusCode: 404, statusMessage: 'User not found' })
    }

    // Delete the Supabase Auth (GoTrue) user behind each email identity FIRST:
    // if this fails nothing has been removed yet, so the whole request is
    // retryable. The reverse order would strand a live GoTrue user — personal
    // data we could no longer find, and an email that can never re-register.
    // A 404 means the auth user is already gone (e.g. a retry after a partial
    // failure) and counts as success.
    for (const identity of user.identities) {
      if (identity.provider !== 'email') continue
      const { error } = await supabase.auth.admin.deleteUser(identity.providerId)
      if (error && error.status !== 404) {
        ;(event.context.logger ?? logger).error(
          { err: error, route: 'DELETE /api/auth/me' },
          '[DELETE /api/auth/me] Supabase Auth user deletion failed',
        )
        throw createError({ statusCode: 500, statusMessage: 'Failed to delete account. Please try again.' })
      }
    }

    // Feedback screenshots live in Supabase Storage, outside the cascade.
    // Best-effort: a failure here is logged loudly but must not strand the
    // account half-deleted — the paths are keyed by userId and recoverable
    // from the log line for manual cleanup.
    const screenshotPaths = user.feedback
      .map(f => f.screenshotPath)
      .filter((path): path is string => Boolean(path))
    if (screenshotPaths.length > 0) {
      const { error } = await supabase.storage.from('feedback-screenshots').remove(screenshotPaths)
      if (error) {
        ;(event.context.logger ?? logger).error(
          { err: error, route: 'DELETE /api/auth/me', screenshotPaths },
          '[DELETE /api/auth/me] Feedback screenshot removal failed — clean up manually',
        )
      }
    }

    // Every user-owned model carries onDelete: Cascade back to User, so this
    // one delete removes identities, refresh tokens, device tokens, programs,
    // sessions, sets, notes, routines and feedback in a single statement.
    await prisma.user.delete({ where: { id: userId } })

    // Clears the cookie for web clients; a no-op for JWT clients, whose access
    // token expires within 15 minutes and whose refresh tokens just cascaded.
    await clearUserSession(event)

    return { success: true }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'DELETE /api/auth/me' }, '[DELETE /api/auth/me] Failed to delete account')
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete account. Please try again.' })
  }
})
