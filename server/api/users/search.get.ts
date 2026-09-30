import type { Prisma } from '@prisma/client'

defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Search users',
    description:
      'Finds users to add as friends. A query containing "@" matches an email exactly (case-insensitive) and never by '
      + 'prefix; anything else matches names by substring. Excludes the caller and anyone blocked in either direction. '
      + 'Returns at most 20 public profiles (never emails). Rate-limited to 30 requests per minute per user.',
    parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: '2–100 characters after trimming. Contains "@" → exact email match; otherwise a name substring.' }],
    responses: {
      200: { description: 'Matching users' },
      400: { description: 'q missing, shorter than 2 or longer than 100 characters' },
      429: { description: 'Too many searches' },
      500: { description: 'Internal server error' },
    },
  },
})

const MIN_QUERY = 2
const MAX_QUERY = 100
const MAX_RESULTS = 20

export default defineEventHandler(async (event): Promise<{ users: PublicUser[] }> => {
  const userId = event.context.userId as string

  const raw = getQuery(event).q
  const q = typeof raw === 'string' ? raw.trim() : ''
  if (q.length < MIN_QUERY || q.length > MAX_QUERY) {
    throw createError({ statusCode: 400, statusMessage: `Query must be ${MIN_QUERY}–${MAX_QUERY} characters` })
  }

  try {
    // Exact-email search reveals whether an address has an account, so it is
    // throttled per user (the IP is the wrong unit behind a shared NAT).
    await rateLimitByKey(`user-search:${userId}`, 30, '1 m')

    const match: Prisma.UserWhereInput = q.includes('@')
      ? { email: { equals: q, mode: 'insensitive' } }
      : { name: { contains: q, mode: 'insensitive' } }

    const users = await prisma.user.findMany({
      where: { ...match, id: { notIn: [userId, ...(await blockedUserIds(userId))] } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: MAX_RESULTS,
      select: publicUserSelect,
    })

    return { users }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/users/search' }, '[GET /api/users/search] Failed to search users')
    throw createError({ statusCode: 500, statusMessage: 'Failed to search users' })
  }
})
