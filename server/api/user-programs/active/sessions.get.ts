import { listRunSessions } from '../../../utils/userProgramSessions'

defineRouteMeta({
  openAPI: {
    tags: ['User Programs'],
    summary: 'List sessions for active program',
    description: 'Returns all workout sessions for the user\'s active program, with completed set counts per session. For an inactive or finished program use /api/user-programs/{id}/sessions, which returns the same shape.',
    responses: {
      200: { description: 'List of workout sessions' },
      401: { description: 'Unauthorized' },
      404: { description: 'No active program' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string

  try {
    const activeProgram = await prisma.userProgram.findFirst({
      where: { userId, isActive: true },
    })

    if (!activeProgram) {
      throw createError({ statusCode: 404, statusMessage: 'No active program' })
    }

    const sessions = await listRunSessions(activeProgram.id)

    return { sessions }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/user-programs/active/sessions' }, '[GET /api/user-programs/active/sessions] Failed to fetch sessions')
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch sessions' })
  }
})
