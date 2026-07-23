import {
  findOwnedStandaloneCompletedSet,
  throwStandaloneCompletedSetMutationError,
} from '../../../../utils/standaloneCompletedSets'

defineRouteMeta({
  openAPI: {
    tags: ['Standalone Workout Sessions'],
    summary: 'Delete a completed set in a standalone session',
    description: 'Removes a completed set record (prescribed or ad-hoc) from a standalone workout session. Works on both in-progress and completed sessions, matching program workout sessions.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'StandaloneWorkoutSession CUID' },
      { name: 'setId', in: 'path', required: true, schema: { type: 'string' }, description: 'StandaloneCompletedSet CUID' },
    ],
    responses: {
      200: { description: 'Set deleted' },
      400: { description: 'Missing IDs' },
      401: { description: 'Unauthorized' },
      404: { description: 'Session or set not found' },
      500: { description: 'Internal server error' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const userId = event.context.userId as string
  const id = getRouterParam(event, 'id')
  const setId = getRouterParam(event, 'setId')

  if (!id?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing session ID' })
  }

  if (!setId?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing set ID' })
  }

  try {
    await findOwnedStandaloneCompletedSet(id, setId, userId)

    await prisma.standaloneCompletedSet.delete({ where: { id: setId } })

    return { deleted: true }
  } catch (error) {
    throwStandaloneCompletedSetMutationError(event, error, 'DELETE /api/standalone-workout-sessions/:id/sets/:setId', 'Failed to delete completed set')
  }
})
