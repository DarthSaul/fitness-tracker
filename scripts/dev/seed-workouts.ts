// Gives the LOCAL fixture accounts workout history, so History, Analytics and
// the profile stats have something to show (docs/LOCAL_DEV.md).
//
//   pnpm db:local:seed-workouts    (after db:local:seed and db:local:seed-social)
//
// `me` is halfway through Brick House: weeks 1–2 done, every set logged, next
// up week 3 day 1. `alice` and `erin` are a few workouts into other programs.
//
// Re-runnable: every program run a fixture account holds is deleted first,
// which cascades to its sessions and sets, and every on-the-go session. That
// includes workouts you logged by hand on a fixture account. `fresh` is left
// with no program and no history.

import { PrismaClient } from '@prisma/client'
import { HANDLES, emailFor, type Handle } from './fixture-accounts'
import { assertLocalTarget } from './local-guard'
import { plannedWeight, trainingDates } from './workout-fixtures'

assertLocalTarget(process.env)

const RUNS: { handle: Handle, program: string, completedWorkouts: number }[] = [
  { handle: 'me', program: 'Brick House', completedWorkouts: 10 },
  { handle: 'alice', program: 'Pool Season', completedWorkouts: 3 },
  { handle: 'erin', program: 'Oak Tree', completedWorkouts: 6 },
]

const FIXTURE_EMAILS = HANDLES.map(emailFor)

const prisma = new PrismaClient()

async function loadProgram(name: string) {
  const program = await prisma.program.findFirst({
    where: { name },
    include: {
      weeks: {
        orderBy: { weekNumber: 'asc' },
        include: {
          days: {
            orderBy: { dayNumber: 'asc' },
            include: {
              exerciseGroups: {
                orderBy: { order: 'asc' },
                include: {
                  exercises: {
                    orderBy: { order: 'asc' },
                    include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  if (!program) throw new Error(`Program "${name}" is missing. Run pnpm db:local:seed first.`)
  return program
}

async function seedRun(userId: string, programName: string, completedWorkouts: number): Promise<string> {
  const program = await loadProgram(programName)
  const days = program.weeks.flatMap((week, weekIndex) =>
    week.days.map((day) => ({ weekNumber: week.weekNumber, weekIndex, day })))
  if (completedWorkouts >= days.length) throw new Error(`${programName} has only ${days.length} days`)

  const next = days[completedWorkouts]!
  const dates = trainingDates(completedWorkouts)

  const run = await prisma.userProgram.create({
    data: {
      userId,
      programId: program.id,
      isActive: true,
      currentWeek: next.weekNumber,
      currentDay: next.day.dayNumber,
      startedAt: dates[0],
    },
  })

  for (const [i, { weekNumber, weekIndex, day }] of days.slice(0, completedWorkouts).entries()) {
    // An evening session: start at 17:30 UTC, one set every 2½ minutes.
    const startedAt = new Date(dates[i]!)
    startedAt.setUTCHours(17, 30, 0, 0)
    const sets = day.exerciseGroups
      .flatMap((group) => group.exercises)
      .flatMap((pe) => pe.sets.map((set) => ({ set, name: pe.exercise.name })))

    const session = await prisma.workoutSession.create({
      data: {
        userId,
        userProgramId: run.id,
        weekNumber,
        dayNumber: day.dayNumber,
        status: 'COMPLETED',
        startedAt,
        completedAt: new Date(startedAt.getTime() + (sets.length * 2.5 + 3) * 60_000),
      },
    })
    await prisma.completedSet.createMany({
      data: sets.map(({ set, name }, k) => ({
        workoutSessionId: session.id,
        exerciseSetId: set.id,
        reps: set.reps,
        weight: plannedWeight(name, set.effortTarget, weekIndex),
        completedAt: new Date(startedAt.getTime() + (k + 1) * 2.5 * 60_000),
      })),
    })
  }

  return `week ${next.weekNumber}, day ${next.day.dayNumber} next`
}

async function main(): Promise<void> {
  const users = await prisma.user.findMany({ where: { email: { in: FIXTURE_EMAILS } }, select: { id: true, email: true } })
  if (users.length !== FIXTURE_EMAILS.length) {
    throw new Error('Fixture accounts are missing. Run pnpm db:local:seed-social first.')
  }
  const idFor = (handle: Handle): string => users.find((u) => u.email === emailFor(handle))!.id
  const userIds = users.map((u) => u.id)

  await prisma.$transaction([
    prisma.userProgram.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.standaloneWorkoutSession.deleteMany({ where: { userId: { in: userIds } } }),
  ])

  for (const { handle, program, completedWorkouts } of RUNS) {
    const position = await seedRun(idFor(handle), program, completedWorkouts)
    console.log(`  ${handle.padEnd(6)} ${program}: ${completedWorkouts} workouts done, ${position}`)
  }
  console.log('Workout history ready.')
}

main()
  .catch((error) => {
    console.error('Workout seed failed:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
