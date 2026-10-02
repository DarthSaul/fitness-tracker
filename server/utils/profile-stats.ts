import type { ProfileVisibility } from '@prisma/client'

/**
 * Opt-out profile stats (docs/social/SPEC-profile-stats.md): the one named
 * exception in ADR 001. Only the active program's NAME (public library data)
 * and ONE count of completed workouts ever leave the server — never the run,
 * its position, dates or any session.
 */

export interface ProfileStats {
  /** null: hidden, or nothing active — deliberately indistinguishable. */
  activeProgram: { name: string } | null
  /** Completed program + standalone sessions; null when hidden. */
  completedWorkoutCount: number | null
}

export interface StatsOwner {
  id: string
  profileVisibility: ProfileVisibility
  showActiveProgram: boolean
  showWorkoutCount: boolean
}

/**
 * The stats `viewerId` may see on `owner`'s profile. The owner always sees
 * both. Anyone else needs the posts rule (`canViewPostsBy`) to pass AND that
 * value's own setting on. A hidden value runs no query.
 */
export async function profileStats(owner: StatsOwner, viewerId: string): Promise<ProfileStats> {
  const isOwner = owner.id === viewerId
  let showProgram = isOwner || owner.showActiveProgram
  let showCount = isOwner || owner.showWorkoutCount
  if (!isOwner && (showProgram || showCount) && !(await canViewPostsBy(viewerId, owner))) {
    showProgram = false
    showCount = false
  }

  const completed = { userId: owner.id, status: 'COMPLETED' as const }
  const [active, programCount, standaloneCount] = await Promise.all([
    showProgram
      ? prisma.userProgram.findFirst({ where: { userId: owner.id, isActive: true }, select: { program: { select: { name: true } } } })
      : null,
    showCount ? prisma.workoutSession.count({ where: completed }) : 0,
    showCount ? prisma.standaloneWorkoutSession.count({ where: completed }) : 0,
  ])

  return {
    activeProgram: active ? { name: active.program.name } : null,
    completedWorkoutCount: showCount ? programCount + standaloneCount : null,
  }
}
