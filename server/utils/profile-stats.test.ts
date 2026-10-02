import { describe, test, expect, vi, beforeEach } from 'vitest'

import { profileStats } from './profile-stats'

const mockCanView = canViewPostsBy as ReturnType<typeof vi.fn>
const mockActive = prisma.userProgram.findFirst as ReturnType<typeof vi.fn>
const mockProgramCount = prisma.workoutSession.count as ReturnType<typeof vi.fn>
const mockStandaloneCount = prisma.standaloneWorkoutSession.count as ReturnType<typeof vi.fn>

const owner = (overrides = {}) => ({
  id: 'ann', profileVisibility: 'PRIVATE' as const, showActiveProgram: true, showWorkoutCount: true, ...overrides,
})

describe('profileStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const m of [mockCanView, mockActive, mockProgramCount, mockStandaloneCount]) m.mockReset()
    mockCanView.mockResolvedValue(true)
    mockActive.mockResolvedValue({ program: { name: 'Arm Farm 2' } })
    mockProgramCount.mockResolvedValue(40)
    mockStandaloneCount.mockResolvedValue(2)
  })

  test('a viewer who passes the posts rule, both settings on → the program name and one total', async () => {
    expect(await profileStats(owner(), 'bob')).toEqual({ activeProgram: { name: 'Arm Farm 2' }, completedWorkoutCount: 42 })

    expect(mockCanView).toHaveBeenCalledWith('bob', owner())
  })

  test('reads only the program name and COMPLETED counts — never the run, position or sessions', async () => {
    await profileStats(owner(), 'bob')

    expect(mockActive).toHaveBeenCalledWith({
      where: { userId: 'ann', isActive: true },
      select: { program: { select: { name: true } } },
    })
    expect(mockProgramCount).toHaveBeenCalledWith({ where: { userId: 'ann', status: 'COMPLETED' } })
    expect(mockStandaloneCount).toHaveBeenCalledWith({ where: { userId: 'ann', status: 'COMPLETED' } })
  })

  test('no active program → activeProgram null, the same as hidden', async () => {
    mockActive.mockResolvedValue(null)

    expect((await profileStats(owner(), 'bob')).activeProgram).toBeNull()
  })

  test('each setting gates only its own value, for non-owners', async () => {
    expect(await profileStats(owner({ showActiveProgram: false }), 'bob')).toEqual({ activeProgram: null, completedWorkoutCount: 42 })
    expect(mockActive).not.toHaveBeenCalled()

    vi.clearAllMocks()
    expect(await profileStats(owner({ showWorkoutCount: false }), 'bob')).toEqual({ activeProgram: { name: 'Arm Farm 2' }, completedWorkoutCount: null })
    expect(mockProgramCount).not.toHaveBeenCalled()
    expect(mockStandaloneCount).not.toHaveBeenCalled()
  })

  test('a viewer who fails the posts rule sees neither, and no stats query runs', async () => {
    mockCanView.mockResolvedValue(false)

    expect(await profileStats(owner(), 'stranger')).toEqual({ activeProgram: null, completedWorkoutCount: null })
    expect(mockActive).not.toHaveBeenCalled()
    expect(mockProgramCount).not.toHaveBeenCalled()
  })

  test('both settings off → nulls, without even checking visibility', async () => {
    expect(await profileStats(owner({ showActiveProgram: false, showWorkoutCount: false }), 'bob'))
      .toEqual({ activeProgram: null, completedWorkoutCount: null })
    expect(mockCanView).not.toHaveBeenCalled()
    expect(mockActive).not.toHaveBeenCalled()
  })

  test('the owner always sees both, whatever the settings, without a visibility check', async () => {
    expect(await profileStats(owner({ showActiveProgram: false, showWorkoutCount: false }), 'ann'))
      .toEqual({ activeProgram: { name: 'Arm Farm 2' }, completedWorkoutCount: 42 })
    expect(mockCanView).not.toHaveBeenCalled()
  })
})
