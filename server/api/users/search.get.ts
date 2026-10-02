import type { Prisma } from '@prisma/client'

defineRouteMeta({
  openAPI: {
    tags: ['Social'],
    summary: 'Search users',
    description:
      'Finds users to follow. A leading "@" is dropped (it marks a username). A query that still contains "@" matches '
      + 'an email exactly (case-insensitive) and never by prefix; anything else matches names by substring or usernames '
      + 'by prefix, with an exact username match first. Excludes the caller and anyone blocked in either direction. '
      + 'Returns at most 20 public profiles (never emails), each with the caller\'s follow state toward them (`outgoing`, `incoming`, `incomingRequestId`). Rate-limited to 30 requests per minute per user.',
    parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: '2–100 characters after trimming and dropping a leading "@". Contains "@" → exact email match; otherwise a name substring or username prefix.' }],
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

export default defineEventHandler(async (event): Promise<{ users: (PublicUser & Relationship)[] }> => {
  const userId = event.context.userId as string

  const raw = getQuery(event).q
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  // A leading "@" marks a username ("@saul"); it is never part of a name or email.
  const q = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
  if (q.length < MIN_QUERY || q.length > MAX_QUERY) {
    throw createError({ statusCode: 400, statusMessage: `Query must be ${MIN_QUERY}–${MAX_QUERY} characters` })
  }

  try {
    // Exact-email search reveals whether an address has an account, so it is
    // throttled per user (the IP is the wrong unit behind a shared NAT).
    await rateLimitByKey(`user-search:${userId}`, 30, '1 m')

    const isEmail = q.includes('@')
    // Usernames are stored lowercase, so the prefix is compared lowercase.
    const handle = q.toLowerCase()
    // Prisma hands contains/startsWith to LIKE unescaped (verified against
    // Postgres), so "_" and "%" would be wildcards: user_1 would find userx1…
    // and "%%" every user. Escape them, and the escape character itself.
    const like = (s: string): string => s.replace(/[\\%_]/g, '\\$&')
    const match: Prisma.UserWhereInput = isEmail
      ? { email: { equals: q, mode: 'insensitive' } }
      : { OR: [{ name: { contains: like(q), mode: 'insensitive' } }, { username: { startsWith: like(handle) } }] }
    const excluded = { notIn: [userId, ...(await blockedUserIds(userId))] }

    // An exact username match leads the results, even if 20 others sort ahead
    // of it by name — a separate lookup, only when q could be a username.
    const [matches, exact] = await Promise.all([
      prisma.user.findMany({
        where: { ...match, id: excluded },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: MAX_RESULTS,
        select: publicUserSelect,
      }),
      !isEmail && usernameProblem(handle) === null
        ? prisma.user.findFirst({ where: { username: handle, id: excluded }, select: publicUserSelect })
        : null,
    ])
    const users = exact
      ? [exact, ...matches.filter((u) => u.id !== exact.id)].slice(0, MAX_RESULTS)
      : matches

    const relationships = await followStatesWith(userId, users.map((u) => u.id))
    return { users: users.map((u) => ({ ...u, ...relationships.get(u.id)! })) }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    ;(event.context.logger ?? logger).error({ err: error, route: 'GET /api/users/search' }, '[GET /api/users/search] Failed to search users')
    throw createError({ statusCode: 500, statusMessage: 'Failed to search users' })
  }
})
