/** Clears the current user session and redirects to the login page. */
export default defineEventHandler(async (event) => {
  await clearUserSession(event)
  return sendRedirect(event, '/login')
})
