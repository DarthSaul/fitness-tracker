/**
 * Lists every workout session of one UserProgram (one run through a program),
 * ordered by program position, with the logged-set count per session.
 *
 * Shared by GET /api/user-programs/active/sessions and
 * GET /api/user-programs/:id/sessions so both return the same shape. Callers
 * are responsible for the ownership check — this helper trusts the id.
 */
export function listRunSessions(userProgramId: string) {
  return prisma.workoutSession.findMany({
    where: { userProgramId },
    // startedAt orders a day logged twice; id makes equal timestamps deterministic
    orderBy: [{ weekNumber: 'asc' }, { dayNumber: 'asc' }, { startedAt: 'asc' }, { id: 'asc' }],
    include: {
      _count: { select: { completedSets: true } },
    },
  })
}
