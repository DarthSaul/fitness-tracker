import { listRunSessions } from '../../../utils/userProgramSessions'

defineRouteMeta({
  openAPI: {
    tags: ['User Programs'],
    summary: 'List sessions for any of the user\'s programs',
    description: 'Returns all workout sessions for one UserProgram owned by the authenticated user, with completed set counts per session. Unlike /api/user-programs/active/sessions this does not require the program to be active, so clients can show and edit the workouts of an inactive or finished program. Same response shape as the active variant.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'UserProgram CUID' },
    ],
    responses: {
      200: { description: 'List of workout sessions' },
      400: { description: 'Missing user program ID' },
      401: { description: 'Unauthorized' },
      404: { description: 'User program not found' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const id = getRouterParam(event, 'id')

  if (!id?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing user program ID' })
  }

  try {
    const userProgram = await prisma.userProgram.findUnique({ where: { id } })
    if (!userProgram || userProgram.userId !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'User program not found' })
    }

    const sessions = await listRunSessions(userProgram.id)

    return { sessions }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/user-programs/:id/sessions' }, '[GET /api/user-programs/:id/sessions] Failed to fetch sessions')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch sessions' })
  }
})
