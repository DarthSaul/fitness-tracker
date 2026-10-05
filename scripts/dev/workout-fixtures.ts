// Pure helpers for scripts/dev/seed-workouts.ts: what weight a fixture
// account logs for a set, and which days it trained.

/** Assumed one-rep maxes for the fixture lifter, in lb. */
const ONE_REP_MAX: Record<string, number> = {
  'Back Squat': 275,
  'Bench': 205,
  'Deadlift': 335,
}

/** Week-1 working weight, in lb, for accessories with no % target. */
const BASE_WEIGHT: Record<string, number> = {
  '1-Arm DB Row': 70,
  'Alt. DB Curls': 30,
  'Barbell 21s': 55,
  'Barbell Bent Over Rows': 135,
  'Barbell Curls': 65,
  'Barbell RDLs': 155,
  'Barbell Shrugs': 185,
  'Barbell Standing Overhead Press': 95,
  'Cable or Band Pushdowns': 50,
  'Chest Supported 2-Arm DB Rows': 45,
  'DB Goblet Squats': 60,
  'DB Hammer Curls': 30,
  'DB Incline Press': 55,
  'DB Laterals': 20,
  'DB Pullover': 50,
  'DB Rear Laterals': 15,
  'DB Reverse Lunge': 40,
  'DB Shrugs': 70,
  'DB Upright Rows': 25,
  'EZ Bar or Straight Bar Skullcrushers': 65,
  'Rear Foot Elevated DB Split Squat': 40,
}

/** Logged with no weight, as the app does for bodyweight work. */
const BODYWEIGHT = /\b(Chin Up|Pull Up|Dips|Push Up|Plank)\b/i

const PERCENT_TARGET = /^([\d.]+)% of (.+) 1RM$/

const roundTo5 = (lb: number): number => Math.round(lb / 5) * 5

/**
 * The weight logged for one set. A "70% of Bench 1RM" target resolves against
 * ONE_REP_MAX and stays fixed, since the program already raises the %. Any
 * other set uses a per-exercise base that grows 5 lb a week (`weekIndex` is
 * 0-based), so the analytics show progress.
 */
export function plannedWeight(exerciseName: string, effortTarget: string | null, weekIndex: number): number | null {
  if (BODYWEIGHT.test(exerciseName)) return null

  const match = effortTarget ? PERCENT_TARGET.exec(effortTarget.trim()) : null
  const max = match ? ONE_REP_MAX[match[2]!] : undefined
  if (match && max) return roundTo5((Number(match[1]) / 100) * max)

  const base = BASE_WEIGHT[exerciseName]
    ?? (/\bDB\b/.test(exerciseName) ? 30 : /\bBarbell\b/.test(exerciseName) ? 95 : 50)
  return base + 5 * weekIndex
}

/**
 * `count` training days ending yesterday, oldest first: three days on, one
 * off, counted back from yesterday. Ending yesterday keeps the dashboard's
 * current streak above zero.
 */
export function trainingDates(count: number, now: Date = new Date()): Date[] {
  const dates: Date[] = []
  let cursor = new Date(now)
  let onInARow = 0
  while (dates.length < count) {
    cursor = new Date(cursor.getTime() - 86_400_000)
    if (onInARow === 3) {
      onInARow = 0
      continue
    }
    dates.push(cursor)
    onInARow++
  }
  return dates.reverse()
}
