defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Check a username',
    description:
      'Whether the caller could take this username, for validating as they type. The input is normalized as '
      + 'PATCH /api/auth/me would store it (trimmed, a leading "@" dropped, lowercased). The caller\'s own current '
      + 'username counts as available. Rate-limited to 60 per minute per user.',
    parameters: [{ name: 'username', in: 'query', required: true, schema: { type: 'string' } }],
    responses: {
      200: { description: '`{ available: true }`, or `{ available: false, reason: "invalid" | "reserved" | "taken" }`' },
      400: { description: 'username missing or not a string' },
      429: { description: 'Too many checks' },
      500: { description: 'Internal server error' },
    },
  },
})

type Availability = { available: true } | { available: false; reason: 'invalid' | 'reserved' | 'taken' }

export default defineEventHandler(async (event): Promise<Availability> => {
  const userId = event.context.userId as string
  const raw = getQuery(event).username
  if (typeof raw !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'username is required' })
  }
  const name = normalizeUsername(raw)

  try {
    // Says which names exist; usernames are public anyway, but it's throttled.
    await rateLimitByKey(`username-check:${userId}`, 60, '1 m')

    const problem = usernameProblem(name)
    if (problem) return { available: false, reason: problem }

    const holder = await prisma.user.findUnique({ where: { username: name }, select: { id: true } })
    return holder && holder.id !== userId ? { available: false, reason: 'taken' } : { available: true }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/users/username-available' }, '[GET /api/users/username-available] Failed to check username')
    throw createError({ statusCode: 500, statusMessage: 'Failed to check username' })
  }
})
