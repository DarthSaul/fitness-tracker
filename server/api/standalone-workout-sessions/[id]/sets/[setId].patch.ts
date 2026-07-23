import type { Prisma } from '@prisma/client'
import {
  findOwnedStandaloneCompletedSet,
  throwStandaloneCompletedSetMutationError,
} from '../../../../utils/standaloneCompletedSets'

defineRouteMeta({
  openAPI: {
    tags: ['Standalone Workout Sessions'],
    summary: 'Update a completed set in a standalone session',
    description: 'Updates the reps, weight, RPE, or notes on an existing completed set (prescribed or ad-hoc). Works on both in-progress and completed sessions, matching program workout sessions.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'StandaloneWorkoutSession CUID' },
      { name: 'setId', in: 'path', required: true, schema: { type: 'string' }, description: 'StandaloneCompletedSet CUID' },
    ],
    responses: {
      200: { description: 'Updated completed set' },
      400: { description: 'Invalid fields' },
      401: { description: 'Unauthorized' },
      404: { description: 'Session or set not found' },
      500: { description: 'Internal server error' },
    },
  },
})

// Editable scalar fields on a completed set. Derived from the Prisma create
// input (plain scalars) rather than the update input, whose field-operation
// unions would not fit the inline validation below.
type CompletedSetUpdateBody = Partial<
  Pick<Prisma.StandaloneCompletedSetUncheckedCreateInput, 'reps' | 'weight' | 'rpe' | 'notes'>
>

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
    const body: CompletedSetUpdateBody = (await readBody<CompletedSetUpdateBody | null>(event)) ?? {}
    const { reps, weight, rpe, notes } = body

    if (reps !== undefined && reps !== null && (!Number.isFinite(reps) || reps < 0)) {
      throw createError({ statusCode: 400, statusMessage: 'reps must be a non-negative number' })
    }
    if (weight !== undefined && weight !== null && (!Number.isFinite(weight) || weight < 0)) {
      throw createError({ statusCode: 400, statusMessage: 'weight must be a non-negative number' })
    }
    if (rpe !== undefined && rpe !== null && (!Number.isFinite(rpe) || rpe < 0 || rpe > 10)) {
      throw createError({ statusCode: 400, statusMessage: 'rpe must be between 0 and 10' })
    }
    if (notes !== undefined && notes !== null && (typeof notes !== 'string' || notes.length > 500)) {
      throw createError({ statusCode: 400, statusMessage: 'notes must be a string of 500 characters or less' })
    }

    await findOwnedStandaloneCompletedSet(id, setId, userId)

    const updated = await prisma.standaloneCompletedSet.update({
      where: { id: setId },
      data: {
        ...(reps !== undefined && { reps }),
        ...(weight !== undefined && { weight }),
        ...(rpe !== undefined && { rpe }),
        ...(notes !== undefined && { notes }),
      },
    })

    return updated
  } catch (error) {
    throwStandaloneCompletedSetMutationError(event, error, 'PATCH /api/standalone-workout-sessions/:id/sets/:setId', 'Failed to update completed set')
  }
})
