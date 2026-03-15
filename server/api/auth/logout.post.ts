defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Log out',
    description: 'Clears the current user session and redirects to the login page.',
    responses: {
      302: {
        description: 'Redirects to /login after clearing the session',
      },
    },
  },
})

/** Clears the current user session and redirects to the login page. */
export default defineEventHandler(async (event) => {
  await clearUserSession(event)
  return sendRedirect(event, '/login')
})
