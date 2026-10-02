import { describe, test, expect, vi, beforeEach } from 'vitest'

import { canViewPostsBy, requireVisiblePost, toPostPayloads, parsePageQuery, pageWhere, parsePostBody, parsePostContent, postSelect } from './posts'

const mockIsBlocked = isBlockedEitherWay as ReturnType<typeof vi.fn>
const mockIsFollowing = isFollowing as ReturnType<typeof vi.fn>
const mockSign = signPostPhotos as ReturnType<typeof vi.fn>
const mockSummaries = reactionSummaries as ReturnType<typeof vi.fn>
const mockFindPost = prisma.post.findUnique as ReturnType<typeof vi.fn>

describe('canViewPostsBy — the visibility rule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsBlocked.mockResolvedValue(false)
    mockIsFollowing.mockResolvedValue(false)
  })

  test.each([
    // [label, profile, blocked, accepted follower, expected]
    ['a stranger sees a PUBLIC profile', 'PUBLIC', false, false, true],
    ['a stranger does not see a PRIVATE profile', 'PRIVATE', false, false, false],
    ['an accepted follower sees a PRIVATE profile', 'PRIVATE', false, true, true],
    ['a follower sees a PUBLIC profile', 'PUBLIC', false, true, true],
    ['a blocked user does not see a PUBLIC profile', 'PUBLIC', true, false, false],
    ['a blocked user does not see a PRIVATE profile, even with a stale follow', 'PRIVATE', true, true, false],
  ] as const)('%s', async (_label, profileVisibility, blocked, following, expected) => {
    mockIsBlocked.mockResolvedValue(blocked)
    mockIsFollowing.mockResolvedValue(following)

    expect(await canViewPostsBy('viewer', { id: 'author', profileVisibility })).toBe(expected)
  })

  test('a pending request is not enough: isFollowing is the ACCEPTED check', async () => {
    await canViewPostsBy('viewer', { id: 'author', profileVisibility: 'PRIVATE' })
    expect(mockIsFollowing).toHaveBeenCalledWith('viewer', 'author')
  })

  test('the author always sees their own posts, without any lookups', async () => {
    expect(await canViewPostsBy('author', { id: 'author', profileVisibility: 'PRIVATE' })).toBe(true)
    expect(mockIsBlocked).not.toHaveBeenCalled()
    expect(mockIsFollowing).not.toHaveBeenCalled()
  })

  test('a PUBLIC profile skips the follow lookup', async () => {
    await canViewPostsBy('viewer', { id: 'author', profileVisibility: 'PUBLIC' })
    expect(mockIsFollowing).not.toHaveBeenCalled()
  })
})

describe('toPostPayloads', () => {
  const author = { id: 'author', name: 'Ada', avatarUrl: null, profileVisibility: 'PRIVATE' as const }
  const row = (id: string, photos: { id: string; storagePath: string; width: number; height: number }[] = []) => ({
    id,
    authorId: 'author',
    body: 'Leg day',
    createdAt: new Date('2026-09-30T12:00:00.000Z'),
    editedAt: null,
    author,
    photos,
    sharedWorkoutKind: null as 'PROGRAM' | 'STANDALONE' | null,
    sharedProgramName: null as string | null,
  })
  const expiresAt = '2026-09-30T12:15:00.000Z'

  beforeEach(() => {
    vi.clearAllMocks()
    mockSign.mockResolvedValue({ urls: new Map(), expiresAt: null })
    mockSummaries.mockResolvedValue(new Map())
  })

  test('builds the payload without leaking authorId or storage keys, and flags isMine for the author', async () => {
    const [mine] = await toPostPayloads([row('p1')], 'author')
    const [theirs] = await toPostPayloads([row('p1')], 'someone-else')

    expect(mine).toEqual({
      id: 'p1',
      author,
      body: 'Leg day',
      createdAt: row('p1').createdAt,
      editedAt: null,
      isMine: true,
      photos: [],
      photosExpireAt: null,
      reactions: [],
      workout: null,
    })
    expect(theirs!.isMine).toBe(false)
  })

  test('a shared workout becomes text-only data: the program name, or null for a standalone', async () => {
    const posts = await toPostPayloads([
      { ...row('p1'), sharedWorkoutKind: 'PROGRAM', sharedProgramName: 'Arm Farm 2' },
      { ...row('p2'), sharedWorkoutKind: 'STANDALONE', sharedProgramName: null },
    ], 'viewer')

    expect(posts[0]!.workout).toEqual({ programName: 'Arm Farm 2' })
    expect(posts[1]!.workout).toEqual({ programName: null })
  })

  test('signs every photo on the page in ONE storage call, keeping each post\'s position order', async () => {
    mockSign.mockResolvedValueOnce({
      urls: new Map([['u/a.jpg', 'https://s/a'], ['u/b.jpg', 'https://s/b'], ['u/c.jpg', 'https://s/c']]),
      expiresAt,
    })

    const posts = await toPostPayloads([
      row('p1', [{ id: 'a', storagePath: 'u/a.jpg', width: 10, height: 20 }, { id: 'b', storagePath: 'u/b.jpg', width: 30, height: 40 }]),
      row('p2'),
      row('p3', [{ id: 'c', storagePath: 'u/c.jpg', width: 50, height: 60 }]),
    ], 'viewer')

    expect(mockSign).toHaveBeenCalledTimes(1)
    expect(mockSign).toHaveBeenCalledWith(['u/a.jpg', 'u/b.jpg', 'u/c.jpg'])
    expect(posts[0]!.photos).toEqual([
      { id: 'a', url: 'https://s/a', width: 10, height: 20 },
      { id: 'b', url: 'https://s/b', width: 30, height: 40 },
    ])
    expect(posts[0]!.photosExpireAt).toBe(expiresAt)
    // A text-only post on the same page carries no expiry.
    expect(posts[1]!.photos).toEqual([])
    expect(posts[1]!.photosExpireAt).toBeNull()
    expect(posts[2]!.photos[0]!.url).toBe('https://s/c')
  })

  test("attaches each post's reaction summaries, fetched once for the whole page", async () => {
    mockSummaries.mockResolvedValueOnce(new Map([
      ['p1', [{ emoji: '👍', count: 3, mine: true }]],
      ['p2', []],
    ]))

    const posts = await toPostPayloads([row('p1'), row('p2')], 'viewer')

    expect(mockSummaries).toHaveBeenCalledTimes(1)
    expect(mockSummaries).toHaveBeenCalledWith(['p1', 'p2'], 'viewer')
    expect(posts[0]!.reactions).toEqual([{ emoji: '👍', count: 3, mine: true }])
    expect(posts[1]!.reactions).toEqual([])
  })

  test('an empty page makes no storage call', async () => {
    expect(await toPostPayloads([], 'viewer')).toEqual([])
    expect(mockSign).toHaveBeenCalledWith([])
  })

  test('postSelect selects the author as a PublicUser only', () => {
    expect(postSelect.author).toEqual({ select: { id: true, name: true, avatarUrl: true, profileVisibility: true } })
  })

  test('postSelect reads photos in display (position) order', () => {
    expect(postSelect.photos).toEqual({
      select: { id: true, storagePath: true, width: true, height: true },
      orderBy: { position: 'asc' },
    })
  })

  test('postSelect has no per-post visibility — privacy is per profile', () => {
    expect(postSelect).not.toHaveProperty('visibility')
  })

  test('postSelect reads only the share snapshot, never the session (no extra queries, no session data)', () => {
    expect(postSelect).toMatchObject({ sharedWorkoutKind: true, sharedProgramName: true })
    for (const key of ['workoutSession', 'standaloneSession', 'workoutSessionId', 'standaloneSessionId']) {
      expect(postSelect).not.toHaveProperty(key)
    }
  })
})

describe('parsePostContent', () => {
  test('text only: the body rule applies, no photos', () => {
    expect(parsePostContent({ body: '  hi ' })).toEqual({ body: 'hi', photoIds: [], share: null })
  })

  test('photos may come with no text at all', () => {
    expect(parsePostContent({ photoIds: ['a', 'b'] })).toEqual({ body: '', photoIds: ['a', 'b'], share: null })
    expect(parsePostContent({ body: '   ', photoIds: ['a'] })).toEqual({ body: '', photoIds: ['a'], share: null })
  })

  test('text and photos together, photo order preserved', () => {
    expect(parsePostContent({ body: 'Leg day', photoIds: ['c', 'a', 'b', 'd'] })).toEqual({ body: 'Leg day', photoIds: ['c', 'a', 'b', 'd'], share: null })
  })

  test('a shared workout may come with no text, and the id is trimmed', () => {
    expect(parsePostContent({ workoutSessionId: ' s1 ' })).toEqual({ body: '', photoIds: [], share: { kind: 'PROGRAM', sessionId: 's1' } })
    expect(parsePostContent({ body: '  ', standaloneSessionId: 'x1' })).toEqual({ body: '', photoIds: [], share: { kind: 'STANDALONE', sessionId: 'x1' } })
  })

  test('a share can carry text and photos', () => {
    expect(parsePostContent({ body: 'PR!', photoIds: ['a'], workoutSessionId: 's1' }))
      .toEqual({ body: 'PR!', photoIds: ['a'], share: { kind: 'PROGRAM', sessionId: 's1' } })
  })

  test.each([
    ['both session ids', { workoutSessionId: 's1', standaloneSessionId: 'x1' }],
    ['a blank workoutSessionId', { workoutSessionId: '  ' }],
    ['a non-string standaloneSessionId', { standaloneSessionId: 7 }],
    ['a null workoutSessionId', { body: 'hi', workoutSessionId: null }],
    ['text over 2000 characters, even with a share', { body: 'x'.repeat(2001), workoutSessionId: 's1' }],
  ])('400 for %s', (_label, input) => {
    expect(() => parsePostContent(input)).toThrow(expect.objectContaining({ statusCode: 400 }))
  })

  test.each([
    ['no text and no photos', {}],
    ['empty text and an empty photo list', { body: '', photoIds: [] }],
    ['5 photos', { photoIds: ['a', 'b', 'c', 'd', 'e'] }],
    ['a duplicate photo id', { photoIds: ['a', 'a'] }],
    ['photoIds not an array', { photoIds: 'a' }],
    ['a non-string id', { photoIds: ['a', 7] }],
    ['a blank id', { photoIds: [' '] }],
    ['text over 2000 characters, even with photos', { body: 'x'.repeat(2001), photoIds: ['a'] }],
    ['a non-string body with photos', { body: 5, photoIds: ['a'] }],
    ['no body object at all', undefined],
  ])('400 for %s', (_label, input) => {
    expect(() => parsePostContent(input)).toThrow(expect.objectContaining({ statusCode: 400 }))
  })
})

describe('parsePostBody', () => {
  test('may be empty when the post has photos (editing a photo post)', () => {
    expect(parsePostBody('  ', { allowEmpty: true })).toBe('')
    expect(() => parsePostBody('x'.repeat(2001), { allowEmpty: true })).toThrow(expect.objectContaining({ statusCode: 400 }))
    expect(() => parsePostBody(undefined, { allowEmpty: true })).toThrow(expect.objectContaining({ statusCode: 400 }))
  })

  test('trims and accepts 1–2000 characters', () => {
    expect(parsePostBody('  hi  ')).toBe('hi')
    expect(parsePostBody('x'.repeat(2000))).toHaveLength(2000)
  })

  test.each([['empty', ''], ['whitespace', '   '], ['too long', 'x'.repeat(2001)], ['not a string', 5], ['missing', undefined]])(
    '400 when %s',
    (_label, raw) => {
      expect(() => parsePostBody(raw)).toThrow(expect.objectContaining({ statusCode: 400 }))
    },
  )
})

describe('parsePageQuery — same contract as GET /api/history', () => {
  test('defaults to 20 with no cursor', () => {
    expect(parsePageQuery({})).toEqual({ limit: 20 })
  })

  test('clamps limit to 1–50', () => {
    expect(parsePageQuery({ limit: '0' }).limit).toBe(1)
    expect(parsePageQuery({ limit: '500' }).limit).toBe(50)
    expect(parsePageQuery({ limit: '7' }).limit).toBe(7)
  })

  test('parses before + beforeId together', () => {
    expect(parsePageQuery({ before: '2026-09-30T12:00:00.000Z', beforeId: 'p9' })).toEqual({
      limit: 20,
      before: { createdAt: new Date('2026-09-30T12:00:00.000Z'), id: 'p9' },
    })
  })

  test.each([
    ['a non-numeric limit', { limit: '5x' }, 'Invalid limit'],
    ['a negative limit', { limit: '-1' }, 'Invalid limit'],
    ['before without beforeId', { before: '2026-09-30T12:00:00.000Z' }, 'before and beforeId must be provided together'],
    ['beforeId without before', { beforeId: 'p9' }, 'before and beforeId must be provided together'],
    ['an empty before', { before: '', beforeId: 'p9' }, 'Invalid before'],
    ['an empty beforeId', { before: '2026-09-30T12:00:00.000Z', beforeId: '' }, 'Invalid beforeId'],
    ['an unparseable before', { before: 'yesterday', beforeId: 'p9' }, 'Invalid before timestamp'],
  ])('400 on %s', (_label, query, message) => {
    expect(() => parsePageQuery(query)).toThrow(expect.objectContaining({ statusCode: 400, statusMessage: message }))
  })
})

describe('pageWhere', () => {
  test('no cursor → no constraint', () => {
    expect(pageWhere(undefined)).toEqual({})
  })

  test('cursor → strictly older, with the id tiebreak for equal timestamps', () => {
    const createdAt = new Date('2026-09-30T12:00:00.000Z')
    expect(pageWhere({ createdAt, id: 'p9' })).toEqual({
      OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: 'p9' } }],
    })
  })
})

describe('requireVisiblePost — the shared 404 for reaction routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsBlocked.mockResolvedValue(false)
    mockIsFollowing.mockResolvedValue(false)
  })

  test('returns the post when the caller may see its author\'s posts', async () => {
    const post = { id: 'p1', author: { id: 'author', profileVisibility: 'PUBLIC' } }
    mockFindPost.mockResolvedValueOnce(post)

    expect(await requireVisiblePost('p1', 'viewer')).toEqual(post)
    expect(mockFindPost).toHaveBeenCalledWith({
      where: { id: 'p1' },
      select: { id: true, author: { select: { id: true, profileVisibility: true } } },
    })
  })

  test.each([
    ['the post does not exist', null],
    ['the author is PRIVATE and not followed', { id: 'p1', author: { id: 'author', profileVisibility: 'PRIVATE' } }],
  ])('404, never revealing the post, when %s', async (_label, post) => {
    mockFindPost.mockResolvedValueOnce(post)
    await expect(requireVisiblePost('p1', 'viewer')).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Post not found' })
  })

  test('404 when a block exists either way, even on a PUBLIC profile', async () => {
    mockFindPost.mockResolvedValueOnce({ id: 'p1', author: { id: 'author', profileVisibility: 'PUBLIC' } })
    mockIsBlocked.mockResolvedValueOnce(true)

    await expect(requireVisiblePost('p1', 'viewer')).rejects.toMatchObject({ statusCode: 404 })
  })
})
