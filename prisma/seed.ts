import { PrismaClient, ExerciseGroupType } from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helper types & functions for compact data entry
// ---------------------------------------------------------------------------

interface SetInput {
	reps: number;
	notes?: string;
	effortTarget?: string;
}

interface ExerciseInput {
	name: string;
	sets: SetInput[];
}

interface GroupInput {
	type: ExerciseGroupType;
	restSeconds?: number;
	exercises: ExerciseInput[];
}

interface DayInput {
	dayNumber: number;
	warmUp: string;
	exerciseGroups: GroupInput[];
}

interface WeekInput {
	weekNumber: number;
	days: DayInput[];
}

/** Single set */
const s = (reps: number, notes?: string): SetInput =>
	notes ? { reps, notes } : { reps };

/** Single set with effort target */
const se = (reps: number, effortTarget: string, notes?: string): SetInput =>
	notes ? { reps, effortTarget, notes } : { reps, effortTarget };

/** N identical sets */
const r = (reps: number, count: number): SetInput[] =>
	Array.from({ length: count }, () => s(reps));

/** Percentage-based sets (same reps, different %) */
const pct = (reps: number, percentages: number[], ref: string): SetInput[] =>
	percentages.map((p) => ({ reps, effortTarget: `${p}% of ${ref}` }));

/** Single exercise */
const ex = (name: string, ...sets: SetInput[]): ExerciseInput => ({
	name,
	sets,
});

/** Standalone exercise group */
const solo = (exercise: ExerciseInput, restSeconds?: number): GroupInput => ({
	type: ExerciseGroupType.STANDARD,
	restSeconds,
	exercises: [exercise],
});

/** Superset exercise group */
const ss = (exercises: ExerciseInput[], restSeconds?: number): GroupInput => ({
	type: ExerciseGroupType.SUPERSET,
	restSeconds,
	exercises,
});

// ===========================================================================
// BRICK HOUSE PROGRAM
// ===========================================================================

const BRICK_HOUSE_NAME = 'Brick House';
const BRICK_HOUSE_DESCRIPTION =
	'A 4-week, 5-day/week strength program. ' +
	'Progressive overload through percentage-based programming focused on the three main compound lifts: deadlift, squat, and bench press.';

const brickHouseWeeks: WeekInput[] = [
	// ===========================================================================
	// WEEK 1
	// ===========================================================================
	{
		weekNumber: 1,
		days: [
			// -----------------------------------------------------------------------
			// Week 1, Day 1
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: '3 rounds SS: Super Light DB RDLs x5 / Empty Bar Back Squats x5',
				exerciseGroups: [
					solo(
						ex(
							'Deadlift',
							...pct(5, [60, 65, 70, 70], 'Deadlift 1RM'),
						),
						120,
					),
					solo(
						ex(
							'1-Arm DB Row',
							s(10),
							s(5),
							s(5),
							s(5),
							s(10),
						),
						120,
					),
					solo(
						ex(
							'Bench Press',
							...pct(5, [60, 65, 70, 75], 'Bench 1RM'),
						),
						120,
					),
					ss([
						ex('Barbell Curls', ...r(10, 4)),
						ex('Dips or Bench Dips', ...r(10, 5)),
					]),
					ss([
						ex('Chest Supported 2-Arm DB Rows', ...r(25, 3)),
						ex('Barbell Shrugs', ...r(10, 3)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 1, Day 2
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: '3-4 rounds: Empty Bar Goodmornings x5 / DB Goblet Squat (Light) x5',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							...pct(3, [60, 65, 70, 75, 80], 'Back Squat 1RM'),
						),
						150,
					),
					ss(
						[
							ex(
								'DB Pullover',
								s(5),
								s(5),
								s(5),
								s(5),
								s(10),
							),
							ex('Chin Up', ...r(3, 5)),
						],
						120,
					),
					solo(
						ex(
							'Barbell Standing Overhead Press',
							se(5, '35% of Bench 1RM', 'Strict, slow, no legs'),
							s(5),
							s(5),
							s(5),
						),
						120,
					),
					solo(
						ex('DB Rear Laterals', ...r(25, 4)),
						90,
					),
					solo(ex('DB Shrugs', ...r(10, 5))),
				],
			},

			// -----------------------------------------------------------------------
			// Week 1, Day 3
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: '3 rounds: BW Alt. Lunges x5 each leg / Empty Bar Squats x5',
				exerciseGroups: [
					ss(
						[
							ex(
								'DB Reverse Lunge',
								s(5, 'Each leg, alternating'),
								s(5),
								s(5),
							),
							ex('Barbell RDLs', ...r(10, 3)),
						],
						120,
					),
					solo(
						ex(
							'Barbell Bent Over Rows',
							s(10),
							s(5),
							s(5),
							s(5),
							s(10),
						),
						120,
					),
					solo(
						ex(
							'DB Incline Press',
							se(10, '20% of Bench 1RM'),
							s(10),
							s(10),
							s(10),
						),
						120,
					),
					solo(
						ex(
							'Alt. DB Curls',
							s(10),
							s(10),
							s(10),
							s(25),
						),
					),
					ss([
						ex('Cable or Band Pushdowns', ...r(25, 3)),
						ex('DB Shrugs', ...r(10, 3)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 1, Day 4
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: '3 rounds: Empty Bar Snatch Grip RDLs x5 / Empty Bar Front Squats x5',
				exerciseGroups: [
					solo(
						ex(
							'Snatch Grip Deadlift',
							...pct(5, [50, 50, 50, 50], 'Deadlift 1RM'),
						),
						120,
					),
					solo(
						ex(
							'Chest Supported 2-Arm DB Rows',
							s(10),
							s(5),
							s(5),
							s(5),
						),
					),
					solo(
						ex(
							'Bench Press',
							...pct(10, [55, 60, 65, 65], 'Bench 1RM'),
						),
					),
					ss([
						ex('DB Rear Laterals', ...r(15, 3)),
						ex('DB Upright Rows', ...r(15, 3)),
					]),
					ss([
						ex('Barbell 21s', s(21), s(21)),
						ex('DB Shrugs', s(10), s(10)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 1, Day 5
			// -----------------------------------------------------------------------
			{
				dayNumber: 5,
				warmUp: '3 rounds: Empty Bar Overhead Press x10 / Empty Bar Front Squats x5',
				exerciseGroups: [
					solo(
						ex(
							'Front Squat',
							se(5, '45% of Back Squat 1RM'),
							se(5, '50% of Back Squat 1RM'),
							se(5, '55% of Back Squat 1RM'),
							se(10, '45% of Back Squat 1RM'),
						),
						150,
					),
					ss(
						[
							ex('Barbell Bent Over Rows', ...r(10, 3)),
							ex('DB Pullover', ...r(10, 3)),
						],
						150,
					),
					solo(
						ex(
							'Barbell Standing Overhead Press',
							se(10, '30% of Bench 1RM'),
							s(10),
							s(10),
						),
					),
					solo(
						ex(
							'EZ Bar or Straight Bar Skullcrushers',
							s(10),
							s(10),
							s(10),
							s(25),
						),
					),
					solo(ex('DB Rear Laterals', ...r(25, 3))),
				],
			},
		],
	},

	// ===========================================================================
	// WEEK 2
	// ===========================================================================
	{
		weekNumber: 2,
		days: [
			// -----------------------------------------------------------------------
			// Week 2, Day 1
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: '3 rounds: BW Split Squats x5 each leg / Empty Bar Front Squats x5',
				exerciseGroups: [
					ss([
						ex('Rear Foot Elevated DB Split Squat', ...r(5, 4)),
						ex('Barbell RDLs', ...r(10, 4)),
					]),
					solo(
						ex(
							'Chest Supported 2-Arm DB Rows',
							s(10),
							s(5),
							s(5),
							s(5),
							s(25),
						),
					),
					solo(
						ex(
							'Bench Press',
							...pct(5, [65, 70, 75, 80], 'Bench 1RM'),
						),
						150,
					),
					solo(ex('DB Rear Laterals', ...r(20, 4))),
					ss([
						ex('Dips or Bench Dips', ...r(10, 3)),
						ex('DB Hammer Curls', ...r(20, 3)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 2, Day 2
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: '3 rounds: Empty Bar RDLs x10 / DB Goblet Squat x5',
				exerciseGroups: [
					solo(
						ex(
							'Deadlift',
							...pct(5, [60, 70, 75, 75], 'Deadlift 1RM'),
						),
						150,
					),
					ss(
						[
							ex(
								'Chin Up',
								s(3, 'Weighted if able'),
								s(3),
								s(3),
							),
							ex('1-Arm DB Row', ...r(5, 3)),
						],
						150,
					),
					solo(
						ex(
							'Barbell Standing Overhead Press',
							se(10, '30% of Bench 1RM'),
							s(10),
							s(10),
						),
					),
					solo(
						ex(
							'Barbell Curls',
							s(10),
							s(10),
							s(5),
							s(5),
							s(25),
						),
					),
					ss([
						ex('DB Laterals', ...r(15, 2)),
						ex('DB Upright Rows', ...r(15, 2)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 2, Day 3
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: '3 rounds: Empty Bar Squats x5 / KB Swings x10',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							...pct(
								2,
								[65, 70, 75, 80, 85],
								'Back Squat 1RM',
							),
						),
					),
					solo(
						ex(
							'Barbell Bent Over Rows',
							s(10),
							s(5),
							s(5),
							s(5),
							s(20),
						),
						150,
					),
					solo(
						ex(
							'DB Incline Press',
							s(10),
							s(5),
							s(5),
							s(5),
							s(10),
						),
						150,
					),
					ss([
						ex('DB Rear Laterals', ...r(20, 3)),
						ex('Barbell Shrugs', ...r(10, 3)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 2, Day 4
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: '3 rounds: BW Rev. Lunges x5 each leg / Empty Bar Front Squats x5',
				exerciseGroups: [
					ss(
						[
							ex(
								'DB Reverse Lunge',
								s(5, 'Each leg'),
								s(5),
								s(5),
								s(5),
							),
							ex('DB Goblet Squats', ...r(10, 4)),
						],
						150,
					),
					solo(
						ex(
							'Chest Supported 2-Arm DB Rows',
							s(5, 'Heavy AF'),
							s(5),
							s(5),
							s(5),
						),
						120,
					),
					solo(
						ex(
							'Bench Press',
							...pct(12, [55, 60, 65], 'Bench 1RM'),
						),
						180,
					),
					solo(
						ex(
							'EZ Bar or Straight Bar Skullcrushers',
							s(10),
							s(10),
							s(5),
							s(5),
							s(5),
							s(25),
						),
						90,
					),
					ss([
						ex('DB Rear Laterals', ...r(10, 2)),
						ex('Barbell Shrugs', ...r(25, 2)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 2, Day 5
			// -----------------------------------------------------------------------
			{
				dayNumber: 5,
				warmUp: '2-3 rounds: Snatch Grip RDLs x5 (Light) / Empty Bar Back Squats x10',
				exerciseGroups: [
					solo(
						ex(
							'Snatch Grip Deadlift',
							...pct(10, [45, 45, 45], 'Deadlift 1RM'),
						),
						180,
					),
					ss(
						[
							ex('DB Pullover', ...r(5, 3)),
							ex(
								'Chest Supported 2-Arm DB Rows',
								...r(25, 3),
							),
						],
						120,
					),
					solo(
						ex(
							'Barbell Standing Overhead Press',
							se(5, '37.5% of Bench 1RM'),
							s(5),
							s(5),
							s(5),
						),
						120,
					),
					solo(
						ex(
							'DB Rear Laterals',
							s(10),
							s(10),
							s(15),
							s(15),
						),
						90,
					),
					solo(ex('Cable or Band Pushdowns', ...r(25, 4))),
				],
			},
		],
	},

	// ===========================================================================
	// WEEK 3
	// ===========================================================================
	{
		weekNumber: 3,
		days: [
			// -----------------------------------------------------------------------
			// Week 3, Day 1
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: '3 rounds SS: Empty Bar Front Squats x5 / Empty Bar Bent Over Rows x15',
				exerciseGroups: [
					solo(
						ex(
							'Front Squat',
							se(4, '50% of Back Squat 1RM'),
							se(4, '55% of Back Squat 1RM'),
							se(4, '60% of Back Squat 1RM'),
							se(10, '50% of Back Squat 1RM'),
						),
						150,
					),
					solo(
						ex(
							'Pull Up',
							s(3, 'Weighted if able'),
							s(3),
							s(3),
							s(3),
						),
					),
					solo(
						ex(
							'Bench Press',
							...pct(3, [65, 70, 75, 80, 85], 'Bench 1RM'),
						),
					),
					ss([
						ex('Dips or Bench Dips', ...r(10, 3)),
						ex('Alt. DB Curls', ...r(5, 3)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 3, Day 2
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: '3 rounds SS: Empty Bar Split Squats x5 each leg / BW Goodmornings',
				exerciseGroups: [
					ss(
						[
							ex(
								'Barbell Rear Foot Elevated Split Squat',
								...r(5, 3),
							),
							ex('DB RDLs', ...r(10, 3)),
						],
						150,
					),
					solo(ex('DB Pullover', ...r(10, 4))),
					solo(
						ex(
							'Barbell Standing Overhead Press',
							se(
								10,
								'30% of Bench 1RM',
								'Strict, slow, no legs',
							),
							s(10),
							s(10),
						),
					),
					solo(ex('DB Rear Laterals', ...r(20, 3))),
					ss([
						ex('Cable or Band Pushdowns', ...r(20, 3)),
						ex('Barbell Curls', ...r(10, 3)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 3, Day 3
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: '3 rounds SS: KB Swings x10 / DB Goblet Squats x5',
				exerciseGroups: [
					solo(
						ex(
							'Deadlift',
							...pct(
								3,
								[65, 70, 75, 80, 85],
								'Deadlift 1RM',
							),
						),
						150,
					),
					ss([
						ex(
							'Chest Supported 2-Arm DB Rows',
							...r(10, 3),
						),
						ex('DB Rear Laterals', ...r(20, 3)),
					]),
					solo(
						ex(
							'DB Incline Press',
							se(5, '22-25% of Bench 1RM'),
							s(5),
							s(5),
							s(5),
						),
						150,
					),
					solo(
						ex(
							'Alt. DB Curls',
							s(5),
							s(5),
							s(5),
							s(5),
							s(15),
						),
					),
					solo(ex('DB Shrugs', ...r(20, 4))),
				],
			},

			// -----------------------------------------------------------------------
			// Week 3, Day 4
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: '3-4 rounds SS: Empty Bar RDLs x5 / Empty Bar Squats x5',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							...pct(5, [60, 65, 70], 'Back Squat 1RM'),
						),
						150,
					),
					solo(
						ex(
							'Barbell Bent Over Rows',
							s(10),
							s(5),
							s(5),
							s(5),
							s(10),
						),
						120,
					),
					solo(
						ex(
							'Bench Press',
							...pct(15, [50, 55, 60], 'Bench 1RM'),
						),
						180,
					),
					ss(
						[
							ex('DB Rear Laterals', ...r(20, 3)),
							ex('DB Upright Rows', ...r(5, 3)),
						],
						90,
					),
					solo(
						ex('Cable or Band Pushdowns', ...r(25, 3)),
					),
				],
			},

			// -----------------------------------------------------------------------
			// Week 3, Day 5
			// -----------------------------------------------------------------------
			{
				dayNumber: 5,
				warmUp: '3 rounds SS: Light DB Split Squats x5 each leg / BW Goodmornings x10',
				exerciseGroups: [
					ss(
						[
							ex(
								'DB Walking Lunges',
								s(5, 'Each leg'),
								s(5),
								s(5),
								s(5),
							),
							ex('Barbell Goodmornings', ...r(10, 3)),
						],
						150,
					),
					solo(ex('1-Arm DB Row', ...r(5, 4))),
					solo(
						ex(
							'Barbell Standing Overhead Press',
							se(5, '37.5% of Bench 1RM'),
							s(5),
							s(5),
						),
					),
					solo(ex('Barbell 21s', ...r(21, 3))),
				],
			},
		],
	},

	// ===========================================================================
	// WEEK 4
	// ===========================================================================
	{
		weekNumber: 4,
		days: [
			// -----------------------------------------------------------------------
			// Week 4, Day 1
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: '3 rounds SS: Empty Bar Snatch Grip RDLs x5 / Empty Bar Front Squats x5',
				exerciseGroups: [
					solo(
						ex(
							'Snatch Grip Deadlift',
							...pct(5, [50, 52.5, 55], 'Deadlift 1RM'),
						),
						150,
					),
					ss([
						ex('DB Pullover', ...r(5, 3)),
						ex('Chin Up', ...r(3, 3)),
					]),
					solo(
						ex(
							'Bench Press',
							se(5, '70% of Bench 1RM'),
							se(4, '80% of Bench 1RM'),
							se(3, '85% of Bench 1RM'),
							se(2, '90% of Bench 1RM'),
							se(1, '95% of Bench 1RM'),
						),
					),
					solo(
						ex(
							'DB Laterals',
							s(5),
							s(5),
							s(10),
							s(10),
							s(15),
						),
						90,
					),
					solo(ex('Weighted Pushups', ...r(10, 3))),
				],
			},

			// -----------------------------------------------------------------------
			// Week 4, Day 2
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: '3 rounds SS: Empty Bar RDLs x5 / Empty Bar Front Squats x5',
				exerciseGroups: [
					solo(
						ex(
							'Front Squat',
							...pct(5, [50, 50, 50], 'Back Squat 1RM'),
						),
						150,
					),
					solo(
						ex(
							'1-Arm DB Row',
							s(10),
							s(5),
							s(5),
							s(5),
						),
					),
					solo(
						ex(
							'Barbell Standing Overhead Press',
							se(10, '30-32% of Bench 1RM'),
							s(10),
							s(10),
						),
					),
					ss([
						ex(
							'EZ Bar or Straight Bar Skullcrushers',
							...r(10, 3),
						),
						ex('DB Hammer Curls', ...r(20, 3)),
					]),
					solo(
						ex(
							'Barbell Shrugs',
							s(10),
							s(10),
							s(20),
							s(20),
						),
					),
				],
			},

			// -----------------------------------------------------------------------
			// Week 4, Day 3
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: '3 rounds: BW Reverse Lunges x3 each leg / DB Goblet Squats x5',
				exerciseGroups: [
					ss(
						[
							ex(
								'DB Reverse Lunge',
								s(5, 'Each leg'),
								s(5),
								s(5),
							),
							ex('Barbell Goodmornings', ...r(10, 3)),
						],
						120,
					),
					solo(
						ex(
							'DB Pullover',
							s(5),
							s(8),
							s(10),
							s(12),
						),
					),
					solo(
						ex(
							'DB Incline Press',
							se(5, '22-25% of Bench 1RM'),
							s(5),
							s(5),
							s(5),
						),
					),
					solo(ex('DB Rear Laterals', ...r(20, 3))),
				],
			},

			// -----------------------------------------------------------------------
			// Week 4, Day 4
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: '3 rounds SS: Empty Bar Squats x10 / KB Swings x10',
				exerciseGroups: [
					solo(
						ex(
							'Deadlift',
							...pct(3, [60, 70, 75, 80], 'Deadlift 1RM'),
						),
						150,
					),
					ss([
						ex(
							'Chest Supported 2-Arm DB Rows',
							...r(10, 3),
						),
						ex('DB Rear Laterals', ...r(20, 3)),
					]),
					solo(
						ex(
							'Bench Press',
							...pct(5, [65, 70, 75, 80], 'Bench 1RM'),
							se(20, '50% of Bench 1RM'),
						),
						150,
					),
					solo(
						ex('Close Grip Weighted Pushups', ...r(10, 4)),
					),
					ss([
						ex('Barbell Curls', ...r(10, 3)),
						ex('DB Shrugs', ...r(10, 3)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 4, Day 5
			// -----------------------------------------------------------------------
			{
				dayNumber: 5,
				warmUp: '3 rounds SS: Empty Bar Squats & RDLs x5',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							se(5, '60% of Back Squat 1RM'),
							se(6, '60% of Back Squat 1RM'),
							se(7, '60% of Back Squat 1RM'),
							se(8, '60% of Back Squat 1RM'),
							se(9, '60% of Back Squat 1RM'),
							se(10, '60% of Back Squat 1RM'),
						),
						180,
					),
					solo(ex('1-Arm DB Row', ...r(5, 4))),
					solo(
						ex(
							'Barbell Standing Overhead Press',
							s(5),
							s(10),
							s(15),
						),
					),
					ss([
						ex('DB Rear Laterals', ...r(20, 3)),
						ex('Barbell Upright Rows', ...r(10, 3)),
					]),
					ss([
						ex('Cable or Band Pushdowns', ...r(25, 2)),
						ex('Barbell Curls', ...r(25, 2)),
					]),
				],
			},
		],
	},
];

// ===========================================================================
// COACH CAULFIELD'S ARM FARM PROGRAM
// ===========================================================================

const ARM_FARM_NAME = "Coach Caulfield's Arm Farm";
const ARM_FARM_DESCRIPTION =
	'A 4-week, 4-day/week arm-focused hypertrophy program. ' +
	'Heavy emphasis on bicep and tricep development with compound lifts (bench press, squat, deadlift) for foundational strength.';

const armFarmWeeks: WeekInput[] = [
	// ===========================================================================
	// WEEK 1
	// ===========================================================================
	{
		weekNumber: 1,
		days: [
			// -----------------------------------------------------------------------
			// Week 1, Day 1
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: '3 rounds: Arm Swings, Empty Bar Bench x20 reps, 5 pushups',
				exerciseGroups: [
					// 1. a. Bench Press + b. Alt. DB Curls
					ss(
						[
							ex(
								'Bench Press',
								se(8, '60% of Bench 1RM'),
								se(6, '70% of Bench 1RM'),
								se(4, '80% of Bench 1RM'),
								se(2, '85% of Bench 1RM'),
								se(15, '60% of Bench 1RM'),
							),
							ex(
								'Alt. DB Curls',
								s(5),
								s(5),
								s(5),
								s(5),
								s(10),
							),
						],
						150,
					),
					// 2. BB Standing Ovhd Press
					solo(
						ex(
							'Barbell Standing Overhead Press',
							...r(10, 5),
						),
						150,
					),
					// 3. a. DB Rear Laterals + b. EZ Bar Skullcrushers + c. Straight Bar Curl
					ss(
						[
							ex('DB Rear Laterals', ...r(15, 4)),
							ex(
								'EZ Bar or Straight Bar Skullcrushers',
								...r(15, 4),
							),
							ex(
								'Straight Bar Curls',
								s(5),
								s(5),
								s(5),
								s(5),
							),
						],
						150,
					),
					// 4. Back Squat
					solo(
						ex(
							'Back Squat',
							...pct(5, [60, 65, 70], 'Back Squat 1RM'),
						),
						150,
					),
					// Cardio
					ss([
						ex('Barbell Reverse Curls', ...r(10, 4)),
						ex('Cable or Band Pushdowns', ...r(25, 4)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 1, Day 2
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: '3 rounds: Lat Stretches, Light Pulldowns x10 reps',
				exerciseGroups: [
					// 1. a. Weighted Chin-Up + b. Band/or BB Goodmornings
					ss(
						[
							ex(
								'Chin Up',
								s(3, 'Weighted, slow/strict'),
								s(3),
								s(3),
								s(3),
							),
							ex('Barbell Goodmornings', ...r(8, 4)),
						],
						150,
					),
					// 2. 1-Arm DB Row
					solo(
						ex(
							'1-Arm DB Row',
							s(5),
							s(5),
							s(8),
							s(8),
						),
						150,
					),
					// 3. a. BB Bent Over Row + b. BB RDL (use same weight)
					ss(
						[
							ex('Barbell Bent Over Rows', ...r(10, 3)),
							ex(
								'Barbell RDLs',
								s(10, 'Use same weight as rows'),
								s(10),
								s(10),
							),
						],
						150,
					),
					// 4. a. DB Rear Laterals + b. DB Shrugs + c. DB Concentration Curls
					ss(
						[
							ex('DB Rear Laterals', ...r(20, 3)),
							ex('DB Shrugs', ...r(20, 3)),
							ex(
								'DB Concentration Curls',
								s(10, 'Each arm'),
								s(10),
								s(10),
							),
						],
						150,
					),
					// Cardio
					solo(
						ex('Dips or Bench Dips', ...r(15, 3)),
					),
				],
			},

			// -----------------------------------------------------------------------
			// Week 1, Day 3
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: '3 rounds: Empty Bar Bench Press x20, Super Light Lat Pulldowns x20',
				exerciseGroups: [
					// 1. a. Bench Press + b. Straight Bar Curls
					ss(
						[
							ex(
								'Bench Press',
								se(5, '60% of Bench 1RM'),
								se(3, '70% of Bench 1RM'),
								se(2, '80% of Bench 1RM'),
								se(1, '90% of Bench 1RM'),
								se(1, '90% of Bench 1RM'),
								se(1, '90% of Bench 1RM'),
							),
							ex(
								'Straight Bar Curls',
								s(5),
								s(5),
								s(10),
								s(10),
								s(10),
								s(10),
							),
						],
						150,
					),
					// 2. DB Incline
					solo(
						ex(
							'DB Incline Press',
							s(5),
							s(5),
							s(10),
							s(10),
						),
						150,
					),
					// 3. Back Squat
					solo(
						ex(
							'Back Squat',
							...pct(3, [60, 70, 80], 'Back Squat 1RM'),
						),
						150,
					),
					// 4. a. DB Arnold Press + b. BB Shrugs + c. DB Laterals
					ss(
						[
							ex(
								'DB Arnold Press',
								s(10),
								s(12),
								s(15),
							),
							ex(
								'Barbell Shrugs',
								s(10),
								s(12),
								s(15),
							),
							ex(
								'DB Laterals',
								s(10),
								s(12),
								s(15),
							),
						],
						150,
					),
					// Cardio superset
					ss([
						ex('Close Grip Bench', ...r(10, 4)),
						ex(
							'Alt. DB Curls',
							s(5, 'Each arm'),
							s(5),
							s(5),
						),
						ex('Cable or Band Pushdowns', ...r(10, 4)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 1, Day 4
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: '3 rounds: Lat Stretches, Arm Swings, Empty Bar Rows x20',
				exerciseGroups: [
					// 1. a. DB Pullovers + b. BB 21s
					ss(
						[
							ex(
								'DB Pullover',
								s(8, 'Arms long, almost straight'),
								s(8),
								s(8),
							),
							ex('Barbell 21s', ...r(21, 3)),
						],
						150,
					),
					// 2. Chest Supported 2 Arm DB Rows
					solo(
						ex(
							'Chest Supported 2-Arm DB Rows',
							s(5),
							s(5),
							s(10),
							s(10),
							s(15),
							s(15),
						),
						150,
					),
					// 3. a. BB Shrugs + b. DB Rear Laterals
					ss(
						[
							ex('Barbell Shrugs', ...r(10, 4)),
							ex(
								'DB Rear Laterals',
								s(20),
								s(20),
								s(20),
								s(20),
							),
						],
						150,
					),
					// 4. a. DB RDLs + b. DB Hammer Curls
					ss(
						[
							ex('DB RDLs', ...r(10, 3)),
							ex('DB Hammer Curls', ...r(20, 3)),
						],
						150,
					),
					// Cardio superset
					ss([
						ex(
							'Cable or Band Pushdowns',
							...r(25, 3),
						),
						ex(
							'Alt. DB Curls',
							s(10, 'Each arm'),
							s(10),
							s(10),
						),
					]),
				],
			},
		],
	},

	// ===========================================================================
	// WEEK 2
	// ===========================================================================
	{
		weekNumber: 2,
		days: [
			// -----------------------------------------------------------------------
			// Week 2, Day 1
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: '3 rounds: 5 pushups, Empty Bar Bench x20, Super Light Pushdowns x10',
				exerciseGroups: [
					// 1. a. Bench Press + b. DB Hammer Curls
					ss(
						[
							ex(
								'Bench Press',
								se(9, '60% of Bench 1RM'),
								se(7, '70% of Bench 1RM'),
								se(5, '80% of Bench 1RM'),
								se(3, '85% of Bench 1RM'),
								se(12, '65% of Bench 1RM'),
							),
							ex('DB Hammer Curls', ...r(10, 5)),
						],
						150,
					),
					// 2. BB Standing Ovhd Press
					solo(
						ex(
							'Barbell Standing Overhead Press',
							se(8, '32.5-35% of Bench 1RM'),
							s(8),
							s(8),
							s(8),
							s(8),
						),
						150,
					),
					// 3. Big 44s — giant set
					ss(
						[
							ex('DB Laterals', ...r(11, 3)),
							ex('DB Front Raises', ...r(11, 3)),
							ex('DB Rear Laterals', ...r(11, 3)),
							ex('DB Upright Rows', ...r(11, 3)),
						],
						150,
					),
					// 4. Front Squat
					solo(
						ex(
							'Front Squat',
							...pct(
								5,
								[50, 50, 50],
								'Back Squat 1RM',
							),
						),
						150,
					),
					// Cardio superset
					ss([
						ex(
							'EZ Bar or Straight Bar Skullcrushers',
							...r(15, 4),
						),
						ex('Straight Bar Curls', ...r(15, 4)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 2, Day 2
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: '3 rounds: Super Light Pulldowns, Lat Stretches',
				exerciseGroups: [
					// 1. a. Pull Up + b. DB RDLs
					ss(
						[
							ex(
								'Pull Up',
								s(3, 'Weighted if possible'),
								s(3),
								s(3),
								s(3),
							),
							ex('DB RDLs', ...r(5, 4)),
						],
						150,
					),
					// 2. BB Bent Over Row
					solo(
						ex(
							'Barbell Bent Over Rows',
							s(5),
							s(5),
							s(8),
							s(8),
							s(10),
						),
						150,
					),
					// 3. a. BB Curls + b. DB Pullovers
					ss(
						[
							ex('Barbell Curls', ...r(10, 3)),
							ex('DB Pullover', ...r(5, 3)),
						],
						150,
					),
					// 4. a. DB Hammer Curls + b. DB Rear Laterals
					ss(
						[
							ex('DB Hammer Curls', ...r(20, 3)),
							ex('DB Rear Laterals', ...r(20, 3)),
						],
						150,
					),
					// Cardio superset
					ss([
						ex('Close Grip Pushups', ...r(10, 3)),
						ex(
							'Cable or Band Pushdowns',
							...r(10, 3),
						),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 2, Day 3
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: '3 rounds: 5 pushups, Arm Swings, Empty Bar Bench x20 reps',
				exerciseGroups: [
					// 1. a. Bench Press + b. Alt. DB Curls
					ss(
						[
							ex(
								'Bench Press',
								se(5, '65% of Bench 1RM'),
								se(3, '75% of Bench 1RM'),
								se(2, '82.5% of Bench 1RM'),
								se(2, '90% of Bench 1RM'),
								se(2, '90% of Bench 1RM'),
							),
							ex(
								'Alt. DB Curls',
								s(5),
								s(5),
								s(5),
								s(5),
								s(5),
							),
						],
						150,
					),
					// 2. DB Incline
					solo(
						ex(
							'DB Incline Press',
							s(5),
							s(5),
							s(10),
							s(10),
						),
						150,
					),
					// 3. Back Squat
					solo(
						ex(
							'Back Squat',
							...pct(5, [60, 70, 70], 'Back Squat 1RM'),
						),
						150,
					),
					// 4. a. DB Seated Ovhd Press + b. DB Shrugs + c. DB Front Raises
					ss(
						[
							ex(
								'DB Seated Overhead Press',
								s(12),
								s(15),
								s(5),
							),
							ex(
								'DB Shrugs',
								s(12),
								s(15),
								s(5),
							),
							ex(
								'DB Front Raises',
								s(12),
								s(15),
								s(5),
							),
						],
						150,
					),
					// Cardio superset
					ss([
						ex(
							'Cable or Band Pushdowns',
							...r(25, 4),
						),
						ex('DB Hammer Curls', ...r(25, 4)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 2, Day 4
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: '2 rounds: Super Light Pulldowns x20, Lat Stretches',
				exerciseGroups: [
					// 1. a. 1-Arm DB Rows + b. Straight Bar Curls
					ss(
						[
							ex('1-Arm DB Row', ...r(5, 4)),
							ex(
								'Straight Bar Curls',
								s(5),
								s(10),
								s(15),
								s(5),
							),
						],
						150,
					),
					// 2. Weighted Chin Up
					solo(
						ex(
							'Chin Up',
							s(3, 'Weighted if possible'),
							s(3),
							s(3),
							s(3),
						),
						150,
					),
					// 3. a. DB Pullovers + b. DB Rear Laterals
					ss(
						[
							ex(
								'DB Pullover',
								s(5),
								s(8),
								s(10),
							),
							ex('DB Rear Laterals', ...r(15, 3)),
						],
						150,
					),
					// 4. Alt. DB Curls
					solo(
						ex(
							'Alt. DB Curls',
							s(5, 'Each arm'),
							s(8),
							s(10),
							s(12),
						),
						150,
					),
					// Cardio — not a superset per PDF
					ss([
						ex(
							'DB Concentration Curls',
							...r(10, 3),
						),
						ex('Barbell 21s', s(21), s(21)),
					]),
				],
			},
		],
	},

	// ===========================================================================
	// WEEK 3
	// ===========================================================================
	{
		weekNumber: 3,
		days: [
			// -----------------------------------------------------------------------
			// Week 3, Day 1
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: '3 rounds: 5 pushups, 20 Empty Bar Bench, Arm Swings',
				exerciseGroups: [
					// 1. a. Bench Press + b. Alt. DB Curls
					ss(
						[
							ex(
								'Bench Press',
								se(10, '60% of Bench 1RM'),
								se(8, '70% of Bench 1RM'),
								se(6, '80% of Bench 1RM'),
								se(4, '85% of Bench 1RM'),
								se(10, '70% of Bench 1RM'),
							),
							ex(
								'Alt. DB Curls',
								s(5),
								s(5),
								s(5),
								s(5),
								s(5),
							),
						],
						150,
					),
					// 2. BB Standing Ovhd Press
					solo(
						ex(
							'Barbell Standing Overhead Press',
							se(6, '37.5-40% of Bench 1RM'),
							s(6),
							s(6),
							s(6),
						),
						150,
					),
					// 3. Big 27s — giant set
					ss(
						[
							ex('DB Laterals', ...r(9, 3)),
							ex('DB Upright Rows', ...r(9, 3)),
							ex(
								'DB Curl to Overhead Press',
								...r(9, 3),
							),
						],
						150,
					),
					// 4. Back Squat
					solo(
						ex(
							'Back Squat',
							...pct(
								2,
								[60, 70, 80, 80],
								'Back Squat 1RM',
							),
						),
						150,
					),
					// Cardio superset
					ss([
						ex(
							'Barbell Reverse Curls',
							s(10, 'Straight bar'),
							s(10),
							s(10),
							s(10),
						),
						ex('Dips or Bench Dips', ...r(10, 4)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 3, Day 2
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: '2 rounds: Arm Swings, Lat Stretches, Light DB Pullovers x5',
				exerciseGroups: [
					// 1. a. DB Pullovers + b. Chin Up
					ss(
						[
							ex('DB Pullover', ...r(5, 3)),
							ex(
								'Chin Up',
								s(3, 'Weighted if possible'),
								s(3),
								s(3),
							),
						],
						150,
					),
					// 2. BB Bent Over Row
					solo(
						ex(
							'Barbell Bent Over Rows',
							s(5),
							s(5),
							s(10),
							s(10),
						),
						150,
					),
					// 3. a. Band/or BB Goodmornings + b. Chest Supported 2-Arm DB Rows
					ss(
						[
							ex('Barbell Goodmornings', ...r(10, 3)),
							ex(
								'Chest Supported 2-Arm DB Rows',
								...r(20, 3),
							),
						],
						150,
					),
					// 4. a. DB Shrugs + b. DB Rear Laterals
					ss(
						[
							ex('DB Shrugs', ...r(20, 3)),
							ex('DB Rear Laterals', ...r(20, 3)),
						],
						150,
					),
					// Cardio superset
					ss([
						ex('DB Hammer Curls', ...r(20, 3)),
						ex(
							'Cable or Band Pushdowns',
							...r(20, 3),
						),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 3, Day 3
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: '2 rounds: Empty Bar Presses 20, 5 pushups, 20 Easy Pulldowns',
				exerciseGroups: [
					// 1. a. Bench Press + b. Straight Bar Curls
					ss(
						[
							ex(
								'Bench Press',
								se(5, '65% of Bench 1RM'),
								se(3, '75% of Bench 1RM'),
								se(2, '85% of Bench 1RM'),
								se(2, '90% of Bench 1RM'),
								se(2, '90% of Bench 1RM'),
							),
							ex(
								'Straight Bar Curls',
								s(5),
								s(5),
								s(5),
								s(5),
								s(5),
							),
						],
						150,
					),
					// 2. BB Incline Press
					solo(
						ex(
							'Barbell Incline Press',
							...pct(
								5,
								[55, 60, 60],
								'Bench 1RM',
							),
						),
						150,
					),
					// 3. Front Squat
					solo(
						ex(
							'Front Squat',
							...pct(
								5,
								[50, 52.5, 55],
								'Back Squat 1RM',
							),
						),
						150,
					),
					// 4. a. DB Rear Laterals + b. Close Grip Bench + c. DB Rear Laterals
					ss(
						[
							ex('DB Rear Laterals', ...r(10, 3)),
							ex('Close Grip Bench', ...r(10, 3)),
							ex('DB Rear Laterals', ...r(10, 3)),
						],
						150,
					),
					// Cardio superset
					ss([
						ex('Barbell Curls', ...r(10, 4)),
						ex('Dips or Bench Dips', ...r(10, 4)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 3, Day 4
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: '3 rounds: Lat Stretches, Arm Swings, Empty Bar RDLs x10',
				exerciseGroups: [
					// 1. a. Deadlift + b. Alt. DB Curls
					ss(
						[
							ex(
								'Deadlift',
								...pct(
									5,
									[60, 65, 70, 75],
									'Deadlift 1RM',
								),
							),
							ex(
								'Alt. DB Curls',
								s(5),
								s(5),
								s(5),
								s(5),
							),
						],
						150,
					),
					// 2. 1-Arm DB Rows
					solo(ex('1-Arm DB Row', ...r(5, 4)), 150),
					// 3. a. DB RDLs + b. Chest Supported 2-Arm DB Rows
					ss(
						[
							ex('DB RDLs', ...r(10, 3)),
							ex(
								'Chest Supported 2-Arm DB Rows',
								...r(20, 3),
							),
						],
						150,
					),
					// 4. a. BB Shrugs + b. DB Rear Laterals
					ss(
						[
							ex('Barbell Shrugs', ...r(10, 3)),
							ex('DB Rear Laterals', ...r(20, 3)),
						],
						150,
					),
					// Cardio superset
					ss([
						ex(
							'Cable or Band Overhead Triceps Extensions',
							s(15),
							s(25),
							s(25),
						),
						ex('DB Hammer Curls', ...r(25, 3)),
					]),
				],
			},
		],
	},

	// ===========================================================================
	// WEEK 4
	// ===========================================================================
	{
		weekNumber: 4,
		days: [
			// -----------------------------------------------------------------------
			// Week 4, Day 1
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: '3 rounds: Empty Bar Bench 20 reps, Light Pulldowns x20',
				exerciseGroups: [
					// 1. a. Bench Press + b. Straight Bar Curls
					ss(
						[
							ex(
								'Bench Press',
								se(8, '65% of Bench 1RM'),
								se(6, '75% of Bench 1RM'),
								se(4, '82.5% of Bench 1RM'),
								se(2, '90% of Bench 1RM'),
								se(8, '75% of Bench 1RM'),
							),
							ex(
								'Straight Bar Curls',
								s(5),
								s(5),
								s(5),
								s(5),
								s(5),
							),
						],
						150,
					),
					// 2. BB Standing Ovhd Press
					solo(
						ex(
							'Barbell Standing Overhead Press',
							se(5, '40-42.5% of Bench 1RM'),
							s(5),
							s(5),
							s(5),
							s(5),
						),
						150,
					),
					// 3. Big 28s — giant set
					ss(
						[
							ex('DB Front Raises', ...r(7, 3)),
							ex('DB Rear Laterals', ...r(7, 3)),
							ex('DB Upright Rows', ...r(7, 3)),
							ex('DB Laterals', ...r(7, 3)),
						],
						150,
					),
					// 4. Back Squat
					solo(
						ex(
							'Back Squat',
							...pct(
								5,
								[60, 65, 70],
								'Back Squat 1RM',
							),
						),
						150,
					),
					// Cardio superset
					ss([
						ex(
							'Barbell Reverse Curls',
							s(20, 'Straight bar'),
							s(20),
							s(20),
							s(20),
						),
						ex(
							'EZ Bar or Straight Bar Skullcrushers',
							...r(20, 4),
						),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 4, Day 2
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: '2-3 rounds: Lat Stretches, Light Lat Pulldowns, Arm Swings',
				exerciseGroups: [
					// 1. a. Pull Up + b. Band/or BB Goodmornings
					ss(
						[
							ex(
								'Pull Up',
								s(3, 'Weighted if possible'),
								s(3),
								s(3),
								s(3),
							),
							ex('Barbell Goodmornings', ...r(10, 4)),
						],
						150,
					),
					// 2. DB Pullovers
					solo(
						ex(
							'DB Pullover',
							s(5),
							s(8),
							s(10),
							s(12),
						),
						150,
					),
					// 3. a. Alt. DB Curl + b. DB Concentration Curl
					ss(
						[
							ex('Alt. DB Curls', ...r(10, 3)),
							ex(
								'DB Concentration Curls',
								...r(10, 3),
							),
						],
						150,
					),
					// 4. a. DB Rear Laterals + b. DB Shrugs
					ss(
						[
							ex('DB Rear Laterals', ...r(15, 3)),
							ex('DB Shrugs', ...r(15, 3)),
						],
						150,
					),
					// Cardio
					solo(
						ex(
							'Cable or Band Pushdowns',
							...r(25, 4),
						),
					),
				],
			},

			// -----------------------------------------------------------------------
			// Week 4, Day 3
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: '3 rounds: 5 pushups, 20 Empty Bar Presses, Arm Swings',
				exerciseGroups: [
					// 1. a. Bench Press + b. Cable/or Band Face Pulls
					ss(
						[
							ex(
								'Bench Press',
								...pct(
									10,
									[60, 60, 60, 60, 60],
									'Bench 1RM',
								),
							),
							ex(
								'Cable or Band Face Pulls',
								...r(10, 4),
							),
						],
						150,
					),
					// 2. BB Incline Press
					solo(
						ex(
							'Barbell Incline Press',
							...pct(
								10,
								[40, 40, 40],
								'Bench 1RM',
							),
						),
						150,
					),
					// 3. Front Squat
					solo(
						ex(
							'Front Squat',
							...pct(
								3,
								[55, 60, 60],
								'Back Squat 1RM',
							),
						),
						150,
					),
					// 4. Dips/or Bench Dips
					solo(
						ex('Dips or Bench Dips', ...r(10, 4)),
						150,
					),
					// Cardio — 3 separate exercises
					ss([
						ex('DB Rear Laterals', ...r(20, 3)),
						ex('Barbell Curls', ...r(20, 3)),
						ex('Close Grip Pushups', ...r(10, 3)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 4, Day 4
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: '3 rounds: Arm Swings, Lat Stretches, Empty Bar Rows x20',
				exerciseGroups: [
					// 1. a. Deadlift + b. DB Shrugs
					ss(
						[
							ex(
								'Deadlift',
								...pct(
									3,
									[60, 70, 75, 80],
									'Deadlift 1RM',
								),
							),
							ex('DB Shrugs', ...r(15, 4)),
						],
						150,
					),
					// 2. DB Pullovers
					solo(
						ex('DB Pullover', ...r(5, 3)),
						150,
					),
					// 3. a. Chest Supported 2-Arm DB Rows + b. DB Rear Laterals
					ss(
						[
							ex(
								'Chest Supported 2-Arm DB Rows',
								...r(5, 4),
							),
							ex('DB Rear Laterals', ...r(25, 4)),
						],
						150,
					),
					// 4. a. EZ Bar Skullcrushers + b. Straight Bar Curls
					ss(
						[
							ex(
								'EZ Bar or Straight Bar Skullcrushers',
								s(5),
								s(10),
								s(15),
								s(20),
								s(25),
							),
							ex(
								'Straight Bar Curls',
								s(5),
								s(10),
								s(15),
								s(20),
								s(25),
							),
						],
						150,
					),
					// Cardio
					solo(
						ex(
							'Cable or Band Pushdowns',
							...r(25, 4),
						),
					),
				],
			},
		],
	},
];

// ===========================================================================
// ARM FARM 2 PROGRAM
// ===========================================================================

const ARM_FARM_2_NAME = 'Arm Farm 2';
const ARM_FARM_2_DESCRIPTION =
	'A 4-week, 4-day/week progressive arm and strength program. ' +
	'Each day follows a FARM STRONG (compound lifts) → FARM FLEX (isolation) → Cardio Finisher structure.';

const armFarm2Weeks: WeekInput[] = [
	// ===========================================================================
	// WEEK 1
	// ===========================================================================
	{
		weekNumber: 1,
		days: [
			// -----------------------------------------------------------------------
			// Week 1, Day 1 — Bench/Arms
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: '3-4 rounds: Empty Bar Bench Press x20, Cable or Band Face Pulls x10',
				exerciseGroups: [
					// FARM STRONG 1: Bench Press + DB Zottman Curls
					ss(
						[
							ex('Bench Press', se(12, '55% of Bench 1RM'), s(12), s(12), s(12)),
							ex('DB Zottman Curls', ...r(10, 4)),
						],
						180,
					),
					// FARM STRONG 2: Low Angle DB Incline + BB Curls
					ss(
						[
							ex('Low Angle DB Incline', ...r(8, 3)),
							ex('Barbell Curls', ...r(15, 3)),
						],
						120,
					),
					// FARM FLEX: DB Laterals + DB Curl to Overhead Press + Close Grip Bench
					ss(
						[
							ex('DB Laterals', ...r(15, 3)),
							ex('DB Curl to Overhead Press', ...r(10, 3)),
							ex('Close Grip Bench', ...r(10, 3)),
						],
						120,
					),
					// Cardio Finisher
					ss(
						[
							ex('EZ Bar or Straight Bar Skullcrushers', ...r(20, 3)),
							ex('DB Hammer Curls', ...r(20, 3)),
						],
						90,
					),
				],
			},

			// -----------------------------------------------------------------------
			// Week 1, Day 2 — Squat/Back
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: '3 rounds: Light DB Goblet Squats x10, Light KB Swings x10',
				exerciseGroups: [
					// FARM STRONG 1: Back Squat + Face Pulls
					ss(
						[
							ex(
								'Back Squat',
								...pct(7, [60, 65, 67, 70, 76], 'Back Squat 1RM'),
							),
							ex('Cable or Band Face Pulls', ...r(10, 4)),
						],
						180,
					),
					// FARM STRONG 2: Chin Up + Triceps Pushdowns
					ss(
						[
							ex(
								'Chin Up',
								s(3, 'Weighted, slow/strict'),
								s(3),
								s(3),
								s(3),
							),
							ex('Cable or Band Pushdowns', ...r(20, 4)),
						],
						120,
					),
					// FARM FLEX: BB Bent Over Rows + DB Rear Laterals + Close Grip Pushups
					ss(
						[
							ex('Barbell Bent Over Rows', ...r(10, 4)),
							ex('DB Rear Laterals', ...r(20, 4)),
							ex('Close Grip Pushups', ...r(10, 4)),
						],
						120,
					),
					// Cardio Finisher
					ss(
						[
							ex('DB Triceps Tate Press', ...r(15, 4)),
							ex('Barbell Reverse Curls', ...r(15, 4)),
						],
						90,
					),
				],
			},

			// -----------------------------------------------------------------------
			// Week 1, Day 3 — Bench/Arms
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: '3-4 rounds: Empty Bar Bench Press x20, Light Pushdowns x10',
				exerciseGroups: [
					// FARM STRONG 1: Bench Press + Alt. DB Curls
					ss(
						[
							ex(
								'Bench Press',
								...pct(8, [67, 70, 70, 70], 'Bench 1RM'),
							),
							ex('Alt. DB Curls', ...r(5, 4)),
						],
						180,
					),
					// FARM STRONG 2: BB Standing Overhead Press + DB Concentration Curls
					ss(
						[
							ex('Barbell Standing Overhead Press', ...r(5, 4)),
							ex('DB Concentration Curls', ...r(10, 4)),
						],
						120,
					),
					// FARM FLEX: DB Laterals + BB Curls + Bench Dips
					ss(
						[
							ex('DB Laterals', ...r(15, 3)),
							ex('Barbell Curls', ...r(15, 3)),
							ex('Dips or Bench Dips', ...r(10, 3)),
						],
						120,
					),
					// Cardio Finisher
					ss(
						[
							ex('EZ Bar or Straight Bar Skullcrushers', ...r(25, 3)),
							ex('DB Shrugs', ...r(10, 3)),
						],
						90,
					),
				],
			},

			// -----------------------------------------------------------------------
			// Week 1, Day 4 — Deadlift/Back
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: '3 rounds: Empty Bar RDLs x10, Empty Bar Bent Over Rows x10, Lat Stretches',
				exerciseGroups: [
					// FARM STRONG 1: Deadlift + DB Farmers Walk
					ss(
						[
							ex(
								'Deadlift',
								...pct(5, [67, 70, 75, 75], 'Deadlift 1RM'),
							),
							ex(
								'DB Farmers Walk',
								s(1, '40 yards'),
								s(1, '40 yards'),
								s(1, '40 yards'),
								s(1, '40 yards'),
							),
						],
						180,
					),
					// FARM STRONG 2: DB Pullovers + Reverse Grip BB Bent Over Rows
					ss(
						[
							ex('DB Pullover', ...r(7, 4)),
							ex('Reverse Grip Barbell Bent Over Rows', ...r(15, 4)),
						],
						120,
					),
					// FARM FLEX: 1-Arm DB Rows + Close Grip Pushups
					ss(
						[
							ex('1-Arm DB Row', ...r(5, 4)),
							ex('Close Grip Pushups', ...r(10, 4)),
						],
						120,
					),
					// Cardio Finisher
					ss(
						[
							ex('Cable or Band Pushdowns', ...r(20, 4)),
							ex('DB Zottman Curls', ...r(15, 4)),
						],
						90,
					),
				],
			},
		],
	},

	// ===========================================================================
	// WEEK 2
	// ===========================================================================
	{
		weekNumber: 2,
		days: [
			// -----------------------------------------------------------------------
			// Week 2, Day 1 — Bench/Arms
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: '3-4 rounds: Empty Bar Bench Press x20, Cable or Band Face Pulls x10',
				exerciseGroups: [
					ss(
						[
							ex('Bench Press', se(10, '60% of Bench 1RM'), s(10), s(10), s(10)),
							ex('DB Zottman Curls', ...r(10, 4)),
						],
						180,
					),
					ss(
						[
							ex('Low Angle DB Incline', ...r(6, 4)),
							ex('Barbell Curls', ...r(12, 4)),
						],
						120,
					),
					ss(
						[
							ex('DB Laterals', ...r(15, 3)),
							ex('DB Curl to Overhead Press', ...r(12, 3)),
							ex('Close Grip Bench', ...r(12, 3)),
						],
						120,
					),
					ss(
						[
							ex('EZ Bar or Straight Bar Skullcrushers', ...r(25, 3)),
							ex('DB Hammer Curls', ...r(25, 3)),
						],
						90,
					),
				],
			},

			// -----------------------------------------------------------------------
			// Week 2, Day 2 — Squat/Back
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: '3 rounds: Light DB Goblet Squats x10, Light KB Swings x10',
				exerciseGroups: [
					ss(
						[
							ex(
								'Back Squat',
								...pct(6, [65, 67, 70, 72], 'Back Squat 1RM'),
							),
							ex('Cable or Band Face Pulls', ...r(12, 4)),
						],
						180,
					),
					ss(
						[
							ex(
								'Chin Up',
								s(3, 'Weighted if possible'),
								s(3),
								s(3),
								s(3),
								s(3),
							),
							ex('Cable or Band Pushdowns', ...r(20, 4)),
						],
						120,
					),
					ss(
						[
							ex('Barbell Bent Over Rows', ...r(8, 4)),
							ex('DB Rear Laterals', ...r(20, 4)),
							ex('Close Grip Pushups', ...r(12, 4)),
						],
						120,
					),
					ss(
						[
							ex('DB Triceps Tate Press', ...r(20, 4)),
							ex('Barbell Reverse Curls', ...r(15, 4)),
						],
						90,
					),
				],
			},

			// -----------------------------------------------------------------------
			// Week 2, Day 3 — Bench/Arms
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: '3-4 rounds: Empty Bar Bench Press x20, Light Pushdowns x10',
				exerciseGroups: [
					ss(
						[
							ex('Bench Press', se(8, '70% of Bench 1RM'), s(8), s(8), s(8), s(8)),
							ex('Alt. DB Curls', ...r(6, 5)),
						],
						180,
					),
					ss(
						[
							ex('Barbell Standing Overhead Press', ...r(6, 4)),
							ex('DB Concentration Curls', ...r(12, 4)),
						],
						120,
					),
					ss(
						[
							ex('DB Laterals', ...r(15, 3)),
							ex('Barbell Curls', ...r(15, 3)),
							ex('Dips or Bench Dips', ...r(12, 3)),
						],
						120,
					),
					ss(
						[
							ex('EZ Bar or Straight Bar Skullcrushers', ...r(20, 4)),
							ex('DB Shrugs', ...r(20, 4)),
						],
						90,
					),
				],
			},

			// -----------------------------------------------------------------------
			// Week 2, Day 4 — Deadlift/Back
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: '3 rounds: Empty Bar RDLs x10, Empty Bar Bent Over Rows x10, Lat Stretches',
				exerciseGroups: [
					ss(
						[
							ex(
								'Deadlift',
								...pct(5, [67, 72, 75, 77, 77], 'Deadlift 1RM'),
							),
							ex(
								'DB Farmers Walk',
								s(1, '40 yards'),
								s(1, '40 yards'),
								s(1, '40 yards'),
								s(1, '40 yards'),
								s(1, '40 yards'),
							),
						],
						180,
					),
					ss(
						[
							ex('DB Pullover', ...r(8, 4)),
							ex('Reverse Grip Barbell Bent Over Rows', ...r(16, 4)),
						],
						120,
					),
					ss(
						[
							ex('1-Arm DB Row', ...r(6, 4)),
							ex('Close Grip Pushups', ...r(12, 4)),
						],
						120,
					),
					ss(
						[
							ex('Cable or Band Pushdowns', ...r(26, 4)),
							ex('DB Zottman Curls', ...r(15, 4)),
						],
						90,
					),
				],
			},
		],
	},

	// ===========================================================================
	// WEEK 3
	// ===========================================================================
	{
		weekNumber: 3,
		days: [
			// -----------------------------------------------------------------------
			// Week 3, Day 1 — Bench/Arms
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: '3-4 rounds: Empty Bar Bench Press x20, Cable or Band Face Pulls x10',
				exerciseGroups: [
					ss(
						[
							ex('Bench Press', se(8, '70% of Bench 1RM'), s(8), s(8), s(8), s(8)),
							ex('DB Zottman Curls', ...r(12, 5)),
						],
						180,
					),
					ss(
						[
							ex('Low Angle DB Incline', ...r(5, 3)),
							ex('Barbell Curls', ...r(8, 3)),
						],
						120,
					),
					ss(
						[
							ex('DB Laterals', ...r(20, 3)),
							ex('DB Curl to Overhead Press', ...r(15, 3)),
							ex('Close Grip Bench', ...r(15, 3)),
						],
						120,
					),
					ss(
						[
							ex('EZ Bar or Straight Bar Skullcrushers', ...r(10, 3)),
							ex('DB Hammer Curls', ...r(15, 3)),
						],
						90,
					),
				],
			},

			// -----------------------------------------------------------------------
			// Week 3, Day 2 — Squat/Back
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: '3 rounds: Light DB Goblet Squats x10, Light KB Swings x10',
				exerciseGroups: [
					ss(
						[
							ex(
								'Back Squat',
								...pct(5, [67, 72, 75, 75], 'Back Squat 1RM'),
							),
							ex('Cable or Band Face Pulls', ...r(15, 4)),
						],
						180,
					),
					ss(
						[
							ex(
								'Chin Up',
								s(4, 'Weighted if possible'),
								s(4),
								s(4),
								s(4),
							),
							ex('Cable or Band Pushdowns', ...r(25, 4)),
						],
						120,
					),
					ss(
						[
							ex('Barbell Bent Over Rows', ...r(7, 4)),
							ex('DB Rear Laterals', ...r(21, 4)),
							ex('Close Grip Pushups', ...r(12, 4)),
						],
						120,
					),
					ss(
						[
							ex('DB Triceps Tate Press', ...r(25, 4)),
							ex('Barbell Reverse Curls', ...r(12, 4)),
						],
						90,
					),
				],
			},

			// -----------------------------------------------------------------------
			// Week 3, Day 3 — Bench/Arms
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: '3-4 rounds: Empty Bar Bench Press x20, Light Pushdowns x10',
				exerciseGroups: [
					ss(
						[
							ex(
								'Bench Press',
								...pct(6, [72, 75, 75, 75, 75], 'Bench 1RM'),
							),
							ex('Alt. DB Curls', ...r(7, 5)),
						],
						180,
					),
					ss(
						[
							ex('Barbell Standing Overhead Press', ...r(7, 4)),
							ex('DB Concentration Curls', ...r(15, 4)),
						],
						120,
					),
					ss(
						[
							ex('DB Laterals', ...r(26, 4)),
							ex('Barbell Curls', ...r(10, 3)),
							ex('Dips or Bench Dips', ...r(15, 3)),
						],
						120,
					),
					ss(
						[
							ex('EZ Bar or Straight Bar Skullcrushers', ...r(20, 4)),
							ex('DB Shrugs', ...r(25, 4)),
						],
						90,
					),
				],
			},

			// -----------------------------------------------------------------------
			// Week 3, Day 4 — Deadlift/Back
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: '3 rounds: Empty Bar RDLs x10, Empty Bar Bent Over Rows x10, Lat Stretches',
				exerciseGroups: [
					ss(
						[
							ex(
								'Deadlift',
								...pct(3, [72, 75, 80, 82, 82], 'Deadlift 1RM'),
							),
							ex(
								'DB Farmers Walk',
								s(1, '50 yards'),
								s(1, '50 yards'),
								s(1, '50 yards'),
								s(1, '50 yards'),
								s(1, '50 yards'),
							),
						],
						180,
					),
					ss(
						[
							ex('DB Pullover', ...r(5, 4)),
							ex('Reverse Grip Barbell Bent Over Rows', ...r(10, 4)),
						],
						120,
					),
					ss(
						[
							ex('1-Arm DB Row', ...r(7, 4)),
							ex('Close Grip Pushups', ...r(15, 4)),
						],
						120,
					),
					ss(
						[
							ex('Cable or Band Pushdowns', ...r(25, 4)),
							ex('DB Zottman Curls', ...r(10, 4)),
						],
						90,
					),
				],
			},
		],
	},

	// ===========================================================================
	// WEEK 4
	// ===========================================================================
	{
		weekNumber: 4,
		days: [
			// -----------------------------------------------------------------------
			// Week 4, Day 1 — Bench/Arms
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: '3-4 rounds: Empty Bar Bench Press x20, Cable or Band Face Pulls x10',
				exerciseGroups: [
					ss(
						[
							ex(
								'Bench Press',
								...pct(8, [70, 72, 72, 72, 72], 'Bench 1RM'),
							),
							ex('DB Zottman Curls', ...r(15, 5)),
						],
						180,
					),
					ss(
						[
							ex('Low Angle DB Incline', ...r(5, 4)),
							ex('Barbell Curls', ...r(8, 4)),
						],
						120,
					),
					ss(
						[
							ex('DB Laterals', ...r(20, 3)),
							ex('DB Curl to Overhead Press', ...r(15, 3)),
							ex('Close Grip Bench', ...r(15, 3)),
						],
						120,
					),
					ss(
						[
							ex('EZ Bar or Straight Bar Skullcrushers', ...r(10, 3)),
							ex('DB Hammer Curls', ...r(15, 3)),
						],
						90,
					),
				],
			},

			// -----------------------------------------------------------------------
			// Week 4, Day 2 — Squat/Back
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: '3 rounds: Light DB Goblet Squats x10, Light KB Swings x10',
				exerciseGroups: [
					ss(
						[
							ex(
								'Back Squat',
								...pct(5, [67, 75, 77, 80], 'Back Squat 1RM'),
							),
							ex('Cable or Band Face Pulls', ...r(26, 4)),
						],
						180,
					),
					ss(
						[
							ex(
								'Chin Up',
								s(4, 'Weighted if possible'),
								s(4),
								s(4),
								s(4),
								s(4),
							),
							ex('Cable or Band Pushdowns', ...r(25, 5)),
						],
						120,
					),
					ss(
						[
							ex('Barbell Bent Over Rows', ...r(6, 4)),
							ex('DB Rear Laterals', ...r(25, 4)),
							ex('Close Grip Pushups', ...r(13, 4)),
						],
						120,
					),
					ss(
						[
							ex('DB Triceps Tate Press', ...r(25, 4)),
							ex('Barbell Reverse Curls', ...r(10, 4)),
						],
						90,
					),
				],
			},

			// -----------------------------------------------------------------------
			// Week 4, Day 3 — Bench/Arms
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: '3-4 rounds: Empty Bar Bench Press x20, Light Pushdowns x10',
				exerciseGroups: [
					ss(
						[
							ex(
								'Bench Press',
								...pct(4, [75, 80, 80, 80, 80], 'Bench 1RM'),
							),
							ex('Alt. DB Curls', ...r(8, 5)),
						],
						180,
					),
					ss(
						[
							ex('Barbell Standing Overhead Press', ...r(8, 4)),
							ex('DB Concentration Curls', ...r(8, 4)),
						],
						120,
					),
					ss(
						[
							ex('DB Laterals', ...r(20, 3)),
							ex('Barbell Curls', ...r(8, 3)),
							ex('Dips or Bench Dips', ...r(15, 3)),
						],
						120,
					),
					ss(
						[
							ex('EZ Bar or Straight Bar Skullcrushers', ...r(25, 3)),
							ex('DB Shrugs', ...r(25, 3)),
						],
						90,
					),
				],
			},

			// -----------------------------------------------------------------------
			// Week 4, Day 4 — Deadlift/Back
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: '3 rounds: Empty Bar RDLs x10, Empty Bar Bent Over Rows x10, Lat Stretches',
				exerciseGroups: [
					ss(
						[
							ex(
								'Deadlift',
								...pct(3, [70, 75, 80, 85, 85], 'Deadlift 1RM'),
							),
							ex(
								'DB Farmers Walk',
								s(1, '50 yards'),
								s(1, '50 yards'),
								s(1, '50 yards'),
								s(1, '50 yards'),
								s(1, '50 yards'),
							),
						],
						180,
					),
					ss(
						[
							ex('DB Pullover', ...r(5, 4)),
							ex('Reverse Grip Barbell Bent Over Rows', ...r(8, 4)),
						],
						120,
					),
					ss(
						[
							ex('1-Arm DB Row', ...r(8, 4)),
							ex('Close Grip Pushups', ...r(16, 4)),
						],
						120,
					),
					ss(
						[
							ex('Cable or Band Pushdowns', ...r(30, 4)),
							ex('DB Zottman Curls', ...r(10, 4)),
						],
						90,
					),
				],
			},
		],
	},
];

// ===========================================================================
// THE RETURN OF DR. JACKED PROGRAM
// ===========================================================================

const DR_JACKED_NAME = 'The Return of Dr. Jacked';
const DR_JACKED_DESCRIPTION =
	'A 4-week, 5-day/week strength and hypertrophy program. ' +
	'Each day follows a Strong Madness (main lifts) → Extra Jackedness (finisher) structure, ' +
	'with rotating emphasis on deadlifts, squats, bench press, and arm work.';

const drJackedWeeks: WeekInput[] = [
	// ===========================================================================
	// WEEK 1
	// ===========================================================================
	{
		weekNumber: 1,
		days: [
			// -----------------------------------------------------------------------
			// Week 1, Day 1 — Deadlift/Back/Biceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: '3 rounds: Empty Bar RDLs x5, Empty Bar Bent Rows x10, Lat Stretches',
				exerciseGroups: [
					// 1. Snatch Grip Deadlift
					solo(
						ex('Snatch Grip Deadlift', se(8, '45-50% of Deadlift 1RM'), s(8), s(8), s(8)),
						120,
					),
					// 2. a. Chest Supported 2-Arm DB Rows + b. DB Pullover
					ss(
						[
							ex('Chest Supported 2-Arm DB Rows', ...r(20, 4)),
							ex('DB Pullover', ...r(5, 4)),
						],
						120,
					),
					// 3. Weighted Chin Ups
					solo(ex('Chin Up', s(3, 'Weighted'), s(3), s(3)), 120),
					// 4. Heavy BB Curls
					solo(ex('Barbell Curls', ...r(5, 3)), 120),
					// 5. Heavy DB Shrugs
					solo(ex('DB Shrugs', ...r(10, 5)), 120),
					// Cardio: Cable or Band Face Pulls + Barbell 21s
					ss([
						ex('Cable or Band Face Pulls', ...r(20, 3)),
						ex('Barbell 21s', ...r(21, 3)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 1, Day 2 — Shoulders/Triceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: '3 rounds: Empty Bar Overhead Presses x10, Arm Swings, Lat Stretches',
				exerciseGroups: [
					// 1. Seated DB Arnold Press
					solo(
						ex('DB Arnold Press', s(5), s(5), s(5), s(10), s(10), s(20)),
						120,
					),
					// 2. DB Laterals
					solo(
						ex('DB Laterals', s(10), s(10), s(15), s(15), s(20), s(20), s(20)),
						120,
					),
					// 3. Classic Triceps: a. EZ Bar Skulls + b. Close Grip Pushups + c. DB Skullcrushers
					ss(
						[
							ex('EZ Bar or Straight Bar Skullcrushers', s(10), s(15)),
							ex('Close Grip Pushups', s(10), s(10)),
							ex('DB Skullcrushers', s(15), s(15), s(15)),
						],
						120,
					),
					// Cardio
					ss([
						ex('DB Rear Laterals', ...r(20, 3)),
						ex('Cable or Band Pushdowns', ...r(20, 3)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 1, Day 3 — Legs
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: '3 rounds: KB Swings x10, KB Goblet Squats x5',
				exerciseGroups: [
					// 1. Back Squat — 8 sets all at 60%: 3×5, 3×8, 2×10
					solo(
						ex(
							'Back Squat',
							se(5, '60% of Back Squat 1RM'),
							se(5, '60% of Back Squat 1RM'),
							se(5, '60% of Back Squat 1RM'),
							se(8, '60% of Back Squat 1RM'),
							se(8, '60% of Back Squat 1RM'),
							se(8, '60% of Back Squat 1RM'),
							se(10, '60% of Back Squat 1RM'),
							se(10, '60% of Back Squat 1RM'),
						),
						150,
					),
					// 2. DB RDLs
					solo(ex('DB RDLs', ...r(5, 3)), 120),
					// 3. DB Goblet Squats
					solo(ex('DB Goblet Squats', ...r(10, 3)), 120),
					// 4. BB Shrugs
					solo(ex('Barbell Shrugs', ...r(20, 4)), 120),
					// Cardio — Wall Sits
					solo(
						ex(
							'Bodyweight Wall Sits',
							s(1, '30 seconds'),
							s(1, '30 seconds'),
							s(1, '30 seconds'),
							s(1, '30 seconds'),
						),
					),
				],
			},

			// -----------------------------------------------------------------------
			// Week 1, Day 4 — Pull/Back/Biceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: '3 rounds: Lat Stretches, Light DB Rows x5',
				exerciseGroups: [
					// 1. a. Weighted Pull Up + b. BB Bent Over Row
					ss(
						[
							ex('Pull Up', s(4, 'Weighted'), s(4), s(4)),
							ex('Barbell Bent Over Rows', ...r(10, 3)),
						],
						120,
					),
					// 2. a. Weighted Chin Up + b. BB Rev Grip Bent Rows
					ss(
						[
							ex('Chin Up', s(3, 'Weighted'), s(3), s(3)),
							ex('Reverse Grip Barbell Bent Over Rows', ...r(10, 3)),
						],
						120,
					),
					// 3. Heavy Alt. DB Curls
					solo(ex('Alt. DB Curls', ...r(5, 4)), 120),
					// Cardio
					ss([
						ex('DB Hammer Curls', s(25), s(25)),
						ex('DB Concentration Curls', s(10), s(10)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 1, Day 5 — Chest/Triceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 5,
				warmUp: '3 rounds: Empty Bar Incline Presses x20, Arm Swings, Lat Stretches',
				exerciseGroups: [
					// 1. Low Angle Incline Press BB (25-35° optimal)
					solo(
						ex(
							'Barbell Incline Press',
							s(5, '25-35° angle, increase weight each set'),
							s(5),
							s(5),
							s(8),
							s(8),
							s(8),
							s(10),
							s(10),
						),
						150,
					),
					// 2. DB Press on Flat Bench
					solo(ex('DB Flat Bench Press', s(10), s(10), s(5), s(5)), 150),
					// 3. Dips/or Bench Dips (weighted if possible)
					solo(
						ex(
							'Dips or Bench Dips',
							s(10, 'Weighted if possible'),
							s(10),
							s(10),
							s(10),
							s(10),
						),
						120,
					),
					// Cardio
					solo(ex('Cable or Band Overhead Triceps Extensions', ...r(25, 4))),
				],
			},
		],
	},

	// ===========================================================================
	// WEEK 2
	// ===========================================================================
	{
		weekNumber: 2,
		days: [
			// -----------------------------------------------------------------------
			// Week 2, Day 1 — Legs
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: '3 rounds: Empty Bar RDLs x5, DB/KB Goblet Squats x5',
				exerciseGroups: [
					// 1. Back Squat — 9 sets: 3×5@60%, 3×4@70%, 3×3@80%
					solo(
						ex(
							'Back Squat',
							...pct(5, [60, 60, 60], 'Back Squat 1RM'),
							...pct(4, [70, 70, 70], 'Back Squat 1RM'),
							...pct(3, [80, 80, 80], 'Back Squat 1RM'),
						),
						150,
					),
					// 2. a. DB Walking Lunges + b. DB Goblet Squats
					ss(
						[
							ex('DB Walking Lunges', s(5, 'Each leg'), s(5, 'Each leg')),
							ex('DB Goblet Squats', ...r(10, 3)),
						],
						120,
					),
					// 3. DB Shrugs
					solo(ex('DB Shrugs', ...r(25, 4)), 120),
					// Cardio
					solo(
						ex(
							'Bodyweight Wall Sits',
							s(1, '30 seconds'),
							s(1, '30 seconds'),
							s(1, '30 seconds'),
						),
					),
				],
			},

			// -----------------------------------------------------------------------
			// Week 2, Day 2 — Shoulders/Push
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: '3 rounds: Light DB Laterals x10, Arm Swings, Lat Stretches',
				exerciseGroups: [
					// 1. BB Overhead Press (strict, no legs) — ~30% bench max, 10 total sets
					solo(
						ex(
							'Barbell Standing Overhead Press',
							se(8, '~30% of Bench 1RM', 'Strict, no legs'),
							s(8),
							s(6),
							s(8),
							s(8),
							s(8),
							s(10),
						),
						120,
					),
					// 2. Close Grip Bench Press
					solo(
						ex('Close Grip Bench', s(10), s(10), s(8), s(8), s(5), s(5)),
						120,
					),
					// 3. DB Side Laterals
					solo(
						ex('DB Laterals', s(10), s(10), s(15), s(15), s(20)),
						120,
					),
					// 4. DB Skullcrushers
					solo(ex('DB Skullcrushers', ...r(10, 3)), 120),
					// Cardio
					solo(ex('Cable or Band Pushdowns', ...r(25, 4))),
				],
			},

			// -----------------------------------------------------------------------
			// Week 2, Day 3 — Deadlift/Back/Biceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: '3 rounds: KB Swings x10, Lat Stretches, Empty Bar RDLs x5',
				exerciseGroups: [
					// 1. Deadlift — 9 sets: 3×5@60%, 3×4@70%, 3×3@80%
					solo(
						ex(
							'Deadlift',
							...pct(5, [60, 60, 60], 'Deadlift 1RM'),
							...pct(4, [70, 70, 70], 'Deadlift 1RM'),
							...pct(3, [80, 80, 80], 'Deadlift 1RM'),
						),
						150,
					),
					// 2. DB Pullovers
					solo(
						ex('DB Pullover', s(5), s(5), s(5), s(8), s(8), s(10)),
						120,
					),
					// 3. 1-Arm DB Row (Heavy)
					solo(ex('1-Arm DB Row', ...r(5, 3)), 120),
					// 4. Barbell 21s
					solo(ex('Barbell 21s', ...r(21, 3)), 120),
					// Cardio
					solo(ex('DB Rear Laterals', ...r(25, 3))),
				],
			},

			// -----------------------------------------------------------------------
			// Week 2, Day 4 — Chest/Triceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: '3 rounds: Empty Bar Bench Press x20, Arm Swings, Lat Stretches',
				exerciseGroups: [
					// 1. Bench Press — 10 sets across 50-80%
					solo(
						ex(
							'Bench Press',
							se(5, '50% of Bench 1RM'),
							se(5, '60% of Bench 1RM'),
							se(3, '70% of Bench 1RM'),
							se(4, '70% of Bench 1RM'),
							se(5, '70% of Bench 1RM'),
							se(6, '70% of Bench 1RM'),
							se(2, '80% of Bench 1RM'),
							se(3, '80% of Bench 1RM'),
							se(4, '80% of Bench 1RM'),
							se(5, '80% of Bench 1RM'),
						),
						150,
					),
					// 2. a. EZ Bar Skulls + b. Cable or Band Pushdowns
					ss(
						[
							ex('EZ Bar or Straight Bar Skullcrushers', ...r(10, 3)),
							ex('Cable or Band Pushdowns', ...r(20, 4)),
						],
						120,
					),
					// 3. Close Grip Pushups — 100 reps total
					solo(
						ex('Close Grip Pushups', s(100, 'Complete 100 reps in as few sets as possible')),
						120,
					),
					// Cardio
					solo(ex('DB Triceps Kickbacks', ...r(20, 3))),
				],
			},

			// -----------------------------------------------------------------------
			// Week 2, Day 5 — Legs (Front + Back Squat)
			// -----------------------------------------------------------------------
			{
				dayNumber: 5,
				warmUp: '3 rounds: Light DB/KB Goblet Squats x5, KB Swings x10',
				exerciseGroups: [
					// 1. Front Squat (~45% squat max, increase weight each set)
					solo(
						ex(
							'Front Squat',
							se(5, '~45% of Back Squat 1RM', 'Increase weight each set'),
							s(5),
							s(5),
							s(5),
						),
						150,
					),
					// 2. Back Squat
					solo(
						ex('Back Squat', ...pct(10, [50, 50, 50], 'Back Squat 1RM')),
						150,
					),
					// 3. DB Shrugs
					solo(ex('DB Shrugs', ...r(20, 4)), 120),
					// 4. DB Goblet Squats
					solo(ex('DB Goblet Squats', ...r(10, 3)), 120),
					// Cardio
					solo(
						ex('Bodyweight Wall Sits', s(1, '30 seconds'), s(1, '30 seconds')),
					),
				],
			},
		],
	},

	// ===========================================================================
	// WEEK 3
	// ===========================================================================
	{
		weekNumber: 3,
		days: [
			// -----------------------------------------------------------------------
			// Week 3, Day 1 — Shoulders/Triceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: '3 rounds: Arm Swings, Lat Stretches, Empty Bar Overhead Press x10',
				exerciseGroups: [
					// 1. Seated DB Overhead Press — heavy/lighter/burn scheme
					solo(
						ex(
							'DB Seated Overhead Press',
							s(5, 'Heavy'),
							s(5),
							s(5),
							s(10, 'Lighter'),
							s(10),
							s(10),
							s(20, 'Burn'),
							s(20),
						),
						120,
					),
					// 2. a. DB Rear Laterals + b. Cable or Band Face Pulls
					ss(
						[
							ex('DB Rear Laterals', ...r(20, 4)),
							ex('Cable or Band Face Pulls', ...r(20, 4)),
						],
						120,
					),
					// 3. DB Skullcrushers — 10×10 (2 hands on one DB)
					solo(ex('DB Skullcrushers', ...r(10, 10)), 120),
					// Cardio — Close Grip Pushups 50 reps total
					solo(
						ex('Close Grip Pushups', s(50, 'Complete 50 reps in as few sets as possible')),
					),
				],
			},

			// -----------------------------------------------------------------------
			// Week 3, Day 2 — Pull/Back/Biceps (5-round giant set)
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: 'Arm Swings, Lat Stretches',
				exerciseGroups: [
					// 1. Giant set — 5 rounds: Chin Up + DB Pullover + 1-Arm DB Row
					ss(
						[
							ex('Chin Up', s(3, 'Weighted'), s(3), s(3), s(3), s(3)),
							ex('DB Pullover', ...r(5, 5)),
							ex('1-Arm DB Row', s(5, 'Each arm'), s(5), s(5), s(5), s(5)),
						],
						150,
					),
					// 2. Heavy BB Curls
					solo(ex('Barbell Curls', ...r(5, 5)), 120),
					// Cardio
					solo(ex('DB Hammer Curls', ...r(25, 4))),
				],
			},

			// -----------------------------------------------------------------------
			// Week 3, Day 3 — Legs
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: '3 rounds: Empty Bar RDLs x5, Empty Bar Squats x5',
				exerciseGroups: [
					// 1. Back Squat — 7 sets wave loading
					solo(
						ex(
							'Back Squat',
							se(5, '60% of Back Squat 1RM'),
							se(6, '70% of Back Squat 1RM'),
							se(4, '80% of Back Squat 1RM'),
							se(2, '90% of Back Squat 1RM'),
							se(4, '80% of Back Squat 1RM'),
							se(6, '75% of Back Squat 1RM'),
							se(8, '65% of Back Squat 1RM'),
						),
						150,
					),
					// 2. DB RDLs
					solo(ex('DB RDLs', ...r(10, 3)), 120),
					// 3. BB Shrugs
					solo(ex('Barbell Shrugs', ...r(10, 4)), 120),
					// Cardio — DB Goblet Squats 75 reps total
					solo(
						ex('DB Goblet Squats', s(75, 'Complete 75 reps in as few sets as possible')),
					),
				],
			},

			// -----------------------------------------------------------------------
			// Week 3, Day 4 — Chest/Triceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: '3 rounds: Empty Bar Incline Press x10, Arm Swings, Lat Stretches',
				exerciseGroups: [
					// 1. a. Low Angle Incline Press + b. Cable or Band Face Pulls (8 rounds)
					ss(
						[
							ex('Barbell Incline Press', ...r(3, 8)),
							ex('Cable or Band Face Pulls', ...r(15, 8)),
						],
						120,
					),
					// 2. Weighted Close Grip Pushups
					solo(ex('Close Grip Weighted Pushups', ...r(10, 4)), 120),
					// 3. a. Cable or Band Overhead Ext + b. Bench Dips
					ss(
						[
							ex('Cable or Band Overhead Triceps Extensions', ...r(20, 3)),
							ex('Dips or Bench Dips', ...r(10, 3)),
						],
						120,
					),
					// Cardio
					solo(ex('DB Triceps Kickbacks', ...r(10, 3))),
				],
			},

			// -----------------------------------------------------------------------
			// Week 3, Day 5 — Deadlift/Back/Biceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 5,
				warmUp: '3 rounds: Empty Bar RDLs x5, KB Swings x10',
				exerciseGroups: [
					// 1. Snatch Grip Deadlift — 4×10 @ 45-50%
					solo(
						ex('Snatch Grip Deadlift', se(10, '45-50% of Deadlift 1RM'), s(10), s(10), s(10)),
						150,
					),
					// 2. Chest Supported 2-Arm DB Rows
					solo(
						ex(
							'Chest Supported 2-Arm DB Rows',
							s(5), s(5), s(5), s(5),
							s(10), s(10), s(10),
							s(20), s(20),
						),
						120,
					),
					// 3. Barbell 21s
					solo(ex('Barbell 21s', ...r(21, 4)), 120),
					// 4. Heavy Alt DB Curls
					solo(ex('Alt. DB Curls', ...r(5, 4)), 120),
					// Cardio
					solo(ex('DB Hammer Curls', ...r(20, 3))),
				],
			},
		],
	},

	// ===========================================================================
	// WEEK 4
	// ===========================================================================
	{
		weekNumber: 4,
		days: [
			// -----------------------------------------------------------------------
			// Week 4, Day 1 — Legs
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: '3 rounds: Empty Bar Squats x5, Arm Swings, Lat Stretches',
				exerciseGroups: [
					// 1. Back Squat — 7 sets building to 90%
					solo(
						ex(
							'Back Squat',
							se(5, '60% of Back Squat 1RM'),
							se(5, '65% of Back Squat 1RM'),
							se(3, '75% of Back Squat 1RM'),
							se(3, '80% of Back Squat 1RM'),
							se(1, '90% of Back Squat 1RM'),
							se(1, '90% of Back Squat 1RM'),
							se(1, '90% of Back Squat 1RM'),
						),
						150,
					),
					// 2. DB Goblet Squats
					solo(ex('DB Goblet Squats', ...r(10, 4)), 120),
					// 3. BB RDLs
					solo(ex('Barbell RDLs', ...r(5, 3)), 120),
					// 4. DB Shrugs
					solo(
						ex('DB Shrugs', s(25), s(25), s(25), s(10), s(10), s(10)),
						120,
					),
					// Cardio
					solo(
						ex(
							'Bodyweight Wall Sits',
							s(1, '45 seconds'),
							s(1, '45 seconds'),
							s(1, '45 seconds'),
						),
					),
				],
			},

			// -----------------------------------------------------------------------
			// Week 4, Day 2 — Shoulders/Push
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: '3 rounds: Empty Bar Overhead Press x10, Arm Swings, Lat Stretches',
				exerciseGroups: [
					// 1. BB Standing Overhead Press (~35% bench max)
					solo(
						ex(
							'Barbell Standing Overhead Press',
							se(5, '~35% of Bench 1RM'),
							s(5),
							s(5),
							s(5),
							s(10),
						),
						120,
					),
					// 2. a. DB Front Raises + b. DB Side Laterals + c. DB Upright Rows
					ss(
						[
							ex('DB Front Raises', ...r(10, 3)),
							ex('DB Laterals', ...r(10, 3)),
							ex('DB Upright Rows', ...r(10, 3)),
						],
						120,
					),
					// 3. Close Grip Bench Press
					solo(
						ex('Close Grip Bench', s(5), s(5), s(5), s(10), s(10), s(10)),
						120,
					),
					// 4. Bench Dips
					solo(ex('Dips or Bench Dips', ...r(10, 3)), 120),
					// Cardio
					solo(ex('Cable or Band Pushdowns', ...r(25, 4))),
				],
			},

			// -----------------------------------------------------------------------
			// Week 4, Day 3 — Back/Pull/Biceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: '3 rounds: Empty Bar Bent Rows x10, Arm Swings, Lat Stretches',
				exerciseGroups: [
					// 1. 1-Arm DB Rows
					solo(
						ex('1-Arm DB Row', s(5), s(5), s(5), s(10), s(10)),
						120,
					),
					// 2. DB Pullovers
					solo(ex('DB Pullover', ...r(10, 3)), 120),
					// 3. Weighted Pullups
					solo(
						ex('Pull Up', s(3, 'Weighted if possible'), s(3), s(3), s(3)),
						120,
					),
					// 4. a. Rev Grip BB Curl + b. DB Hammer Curls (fill in reps)
					ss(
						[
							ex('Barbell Reverse Curls', ...r(20, 3)),
							ex('DB Hammer Curls', s(15, 'Fill in reps'), s(15), s(15)),
						],
						120,
					),
					// Cardio
					solo(ex('Barbell 21s', s(21), s(21))),
				],
			},

			// -----------------------------------------------------------------------
			// Week 4, Day 4 — Legs (high volume)
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: '3 rounds: Empty Bar RDLs x5, DB Goblet Squats x5',
				exerciseGroups: [
					// 1. Back Squat — 12 sets: 6×6@65%, 4×4@75%, 2×2@85%
					solo(
						ex(
							'Back Squat',
							...pct(6, [65, 65, 65, 65, 65, 65], 'Back Squat 1RM'),
							...pct(4, [75, 75, 75, 75], 'Back Squat 1RM'),
							...pct(2, [85, 85], 'Back Squat 1RM'),
						),
						150,
					),
					// 2. DB Walking Lunges
					solo(
						ex(
							'DB Walking Lunges',
							s(5, 'Each leg'),
							s(5, 'Each leg'),
							s(5, 'Each leg'),
							s(5, 'Each leg'),
						),
						120,
					),
					// 3. BB RDLs
					solo(ex('Barbell RDLs', ...r(10, 3)), 120),
					// 4. DB Shrugs
					solo(ex('DB Shrugs', ...r(20, 4)), 120),
					// Cardio
					solo(ex('DB Goblet Squats', s(20), s(20))),
				],
			},

			// -----------------------------------------------------------------------
			// Week 4, Day 5 — Chest/Triceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 5,
				warmUp: '3 rounds: Empty Bar Bench Press x20, Arm Swings, Lat Stretches',
				exerciseGroups: [
					// 1. Bench Press — 12 sets: 4 rep counts × 4 percentages
					solo(
						ex(
							'Bench Press',
							se(2, '60% of Bench 1RM'),
							se(2, '70% of Bench 1RM'),
							se(2, '80% of Bench 1RM'),
							se(2, '85% of Bench 1RM'),
							se(3, '65% of Bench 1RM'),
							se(3, '70% of Bench 1RM'),
							se(3, '80% of Bench 1RM'),
							se(3, '85% of Bench 1RM'),
							se(4, '60% of Bench 1RM'),
							se(4, '70% of Bench 1RM'),
							se(4, '80% of Bench 1RM'),
							se(4, '85% of Bench 1RM'),
						),
						150,
					),
					// 2. DB Incline Press
					solo(ex('DB Incline Press', ...r(10, 3)), 120),
					// 3. EZ Bar Straight Bar Skulls
					solo(
						ex(
							'EZ Bar or Straight Bar Skullcrushers',
							s(10), s(10), s(10),
							s(15), s(15), s(15),
							s(20), s(20), s(20),
						),
						120,
					),
					// Cardio
					solo(ex('Cable or Band Pushdowns', ...r(25, 4))),
				],
			},
		],
	},
];

// ===========================================================================
// MEAT WAGON PROGRAM
// ===========================================================================

const MEAT_WAGON_NAME = 'Meat Wagon';
const MEAT_WAGON_DESCRIPTION =
	'A 4-week, 4-day/week strength program built around the big three lifts. ' +
	'Heavy bench, squat, and deadlift work every week with accessory pulling, pressing, and arm work.';

const meatWagonWeeks: WeekInput[] = [
	// ===========================================================================
	// WEEK 1
	// ===========================================================================
	{
		weekNumber: 1,
		days: [
			// -----------------------------------------------------------------------
			// Week 1, Day 1 — Bench/Squat/Accessory
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: '3-4 sets: Empty Bar Bench x20, stretch lats, warm up elbows, stretch legs',
				exerciseGroups: [
					// 1. Bench Press
					solo(
						ex(
							'Bench Press',
							se(5, '70% of Bench 1RM'),
							se(5, '75% of Bench 1RM'),
							se(5, '80% of Bench 1RM'),
							se(5, '85% of Bench 1RM'),
							se(10, '65% of Bench 1RM'),
						),
						180,
					),
					// 2. Back Squat
					solo(
						ex(
							'Back Squat',
							se(3, '70% of Back Squat 1RM'),
							se(3, '75% of Back Squat 1RM'),
							se(3, '80% of Back Squat 1RM'),
							se(8, '65% of Back Squat 1RM'),
						),
						180,
					),
					// 3. a. DB Incline + b. BB RDLs
					ss(
						[
							ex('DB Incline Press', ...r(5, 3)),
							ex('Barbell RDLs', ...r(5, 3)),
						],
						120,
					),
					// 4. a. Dips/Bench Dips + b. EZ Bar Skullcrushers
					ss(
						[
							ex('Dips or Bench Dips', ...r(10, 4)),
							ex('EZ Bar or Straight Bar Skullcrushers', ...r(10, 4)),
						],
						120,
					),
					// Cardio: DB Rear Laterals + DB Shrugs
					ss([
						ex('DB Rear Laterals', ...r(15, 3)),
						ex('DB Shrugs', ...r(15, 3)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 1, Day 2 — Deadlift/Pull/Biceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: 'Bodyweight Goodmornings 3x10, Lat Stretches',
				exerciseGroups: [
					// 1. a. Deadlift + b. Cable or Band Face Pulls
					ss(
						[
							ex(
								'Deadlift',
								se(5, '70% of Deadlift 1RM'),
								se(5, '75% of Deadlift 1RM'),
								se(5, '75% of Deadlift 1RM'),
								se(5, '75% of Deadlift 1RM'),
							),
							ex('Cable or Band Face Pulls', ...r(15, 4)),
						],
						180,
					),
					// 2. 1-Arm DB Row
					solo(ex('1-Arm DB Row', ...r(5, 3)), 120),
					// 3. Chin Up (slow & strict, weighted)
					solo(
						ex('Chin Up', s(3, 'Slow & strict, weighted if possible'), s(3), s(3), s(3)),
						120,
					),
					// 4. Weighted Hyperextensions
					solo(ex('Weighted Hyperextensions', ...r(5, 3)), 120),
					// Cardio: Alt. DB Curls + BB Shrugs
					ss([
						ex('Alt. DB Curls', s(5), s(5), s(10), s(10)),
						ex('Barbell Shrugs', ...r(10, 4)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 1, Day 3 — Front Squat/Overhead Press/Triceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: 'Stretch lats, triceps, shoulders. Empty Bar Dead Press, Front Squats, RDLs',
				exerciseGroups: [
					// 1. Front Squat (% of Back Squat 1RM)
					solo(
						ex(
							'Front Squat',
							se(5, '45% of Back Squat 1RM'),
							se(5, '50% of Back Squat 1RM'),
							se(5, '55% of Back Squat 1RM'),
							se(5, '60% of Back Squat 1RM'),
						),
						180,
					),
					// 2. BB Overhead Press (strict, no legs — % of Bench 1RM)
					solo(
						ex(
							'Barbell Standing Overhead Press',
							se(5, '25% of Bench 1RM', 'Strict, feet flat, no legs'),
							se(5, '37% of Bench 1RM'),
							se(5, '40% of Bench 1RM'),
							se(5, '40% of Bench 1RM'),
						),
						180,
					),
					// 3. a. Close Grip Bench + b. DB RDLs
					ss(
						[
							ex('Close Grip Bench', ...r(5, 5)),
							ex('DB RDLs', ...r(10, 5)),
						],
						120,
					),
					// 4. a. Cable or Band Pushdowns + b. DB Skullcrushers
					ss(
						[
							ex('Cable or Band Pushdowns', ...r(20, 4)),
							ex('DB Skullcrushers', ...r(15, 4)),
						],
						120,
					),
					// Cardio: DB Shrugs
					solo(ex('DB Shrugs', ...r(20, 4))),
				],
			},

			// -----------------------------------------------------------------------
			// Week 1, Day 4 — Sumo Deadlift/Back/Biceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: 'Light KB Swings, KB RDLs, loosen up legs and lats',
				exerciseGroups: [
					// 1. Sumo Deadlift
					solo(
						ex(
							'Sumo Deadlift',
							se(3, '75% of Deadlift 1RM'),
							se(3, '85% of Deadlift 1RM'),
							se(3, '80% of Deadlift 1RM'),
							se(3, '80% of Deadlift 1RM'),
						),
						180,
					),
					// 2. DB Pullovers
					solo(ex('DB Pullover', ...r(5, 5)), 120),
					// 3. Reverse Grip BB Bent Rows
					solo(ex('Reverse Grip Barbell Bent Over Rows', ...r(5, 4)), 120),
					// 4. Chest Supported 2-Arm DB Rows
					solo(ex('Chest Supported 2-Arm DB Rows', ...r(20, 3)), 120),
					// Cardio: BB Curls + DB Rear Laterals + BB Shrugs
					ss([
						ex('Barbell Curls', ...r(10, 3)),
						ex('DB Rear Laterals', ...r(20, 3)),
						ex('Barbell Shrugs', ...r(10, 3)),
					]),
				],
			},
		],
	},

	// ===========================================================================
	// WEEK 2
	// ===========================================================================
	{
		weekNumber: 2,
		days: [
			// -----------------------------------------------------------------------
			// Week 2, Day 1 — Bench/Squat/Accessory
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: 'Empty Bar Presses 3-4 sets of 20, Light Triceps Pushdowns, Lat Stretches',
				exerciseGroups: [
					solo(
						ex(
							'Bench Press',
							se(5, '75% of Bench 1RM'),
							se(5, '80% of Bench 1RM'),
							se(5, '85% of Bench 1RM'),
							se(5, '80% of Bench 1RM'),
							se(10, '70% of Bench 1RM'),
						),
						180,
					),
					solo(
						ex(
							'Back Squat',
							se(2, '75% of Back Squat 1RM'),
							se(2, '80% of Back Squat 1RM'),
							se(2, '80% of Back Squat 1RM'),
							se(2, '80% of Back Squat 1RM'),
							se(5, '70% of Back Squat 1RM'),
						),
						300,
					),
					ss(
						[
							ex('DB Incline Press', ...r(5, 3)),
							ex('Barbell RDLs', ...r(5, 3)),
						],
						120,
					),
					ss(
						[
							ex('Dips or Bench Dips', ...r(10, 4)),
							ex('EZ Bar or Straight Bar Skullcrushers', ...r(10, 4)),
						],
						120,
					),
					// Cardio: DB Laterals + BB Shrugs
					ss([
						ex('DB Laterals', ...r(20, 3)),
						ex('Barbell Shrugs', ...r(20, 3)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 2, Day 2 — Deadlift/Pull/Biceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: 'Light KB Swings, stretch legs',
				exerciseGroups: [
					ss(
						[
							ex(
								'Deadlift',
								se(3, '75% of Deadlift 1RM'),
								se(3, '80% of Deadlift 1RM'),
								se(3, '80% of Deadlift 1RM'),
								se(3, '80% of Deadlift 1RM'),
							),
							ex('Cable or Band Face Pulls', ...r(15, 4)),
						],
						180,
					),
					solo(
						ex('Pull Up', s(3, 'Slow & strict, weighted if possible'), s(3), s(3), s(3)),
						120,
					),
					solo(ex('1-Arm DB Row', ...r(5, 3)), 120),
					solo(ex('Weighted Hyperextensions', ...r(6, 3)), 120),
					// Cardio: Barbell 21s + DB Shrugs
					ss([
						ex('Barbell 21s', ...r(21, 3)),
						ex('DB Shrugs', ...r(15, 3)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 2, Day 3 — Front Squat/Overhead Press/Triceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: 'Loosen up upper body — triceps, shoulders, lats, forearms',
				exerciseGroups: [
					solo(
						ex(
							'Front Squat',
							se(5, '50% of Back Squat 1RM'),
							se(5, '55% of Back Squat 1RM'),
							se(5, '60% of Back Squat 1RM'),
							se(5, '60% of Back Squat 1RM'),
						),
						300,
					),
					solo(
						ex(
							'Barbell Standing Overhead Press',
							se(6, '25% of Bench 1RM', 'Strict, feet flat, no legs'),
							se(6, '37% of Bench 1RM'),
							se(6, '40% of Bench 1RM'),
							se(6, '40% of Bench 1RM'),
						),
						120,
					),
					ss(
						[
							ex('Close Grip Bench', ...r(6, 5)),
							ex('DB RDLs', ...r(5, 5)),
						],
						120,
					),
					ss(
						[
							ex('Cable or Band Pushdowns', ...r(25, 4)),
							ex('DB Skullcrushers', ...r(10, 4)),
						],
						120,
					),
					// Cardio: BB Shrugs
					solo(ex('Barbell Shrugs', ...r(10, 3))),
				],
			},

			// -----------------------------------------------------------------------
			// Week 2, Day 4 — Sumo Deadlift/Back/Biceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: 'Leg swings, lat stretches',
				exerciseGroups: [
					solo(
						ex(
							'Sumo Deadlift',
							se(4, '75% of Deadlift 1RM'),
							se(4, '80% of Deadlift 1RM'),
							se(4, '80% of Deadlift 1RM'),
							se(4, '80% of Deadlift 1RM'),
						),
						180,
					),
					solo(ex('Reverse Grip Barbell Bent Over Rows', ...r(5, 4)), 120),
					solo(ex('DB Pullover', ...r(5, 4)), 120),
					solo(ex('Chest Supported 2-Arm DB Rows', ...r(25, 3)), 120),
					// Cardio: DB Hammer Curls + DB Front Raises + BB Shrugs
					ss([
						ex('DB Hammer Curls', ...r(20, 3)),
						ex('DB Front Raises', ...r(20, 3)),
						ex('Barbell Shrugs', ...r(10, 3)),
					]),
				],
			},
		],
	},

	// ===========================================================================
	// WEEK 3
	// ===========================================================================
	{
		weekNumber: 3,
		days: [
			// -----------------------------------------------------------------------
			// Week 3, Day 1 — Bench/Squat/Accessory
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: 'Lat Stretches, Empty Bar Presses, Triceps warm-up, good tunes',
				exerciseGroups: [
					solo(
						ex(
							'Bench Press',
							se(4, '75% of Bench 1RM'),
							se(4, '80% of Bench 1RM'),
							se(4, '85% of Bench 1RM'),
							se(4, '85% of Bench 1RM'),
							se(8, '75% of Bench 1RM'),
						),
						180,
					),
					solo(
						ex(
							'Back Squat',
							se(5, '70% of Back Squat 1RM'),
							se(5, '75% of Back Squat 1RM'),
							se(5, '70% of Back Squat 1RM'),
							se(5, '70% of Back Squat 1RM'),
							se(5, '70% of Back Squat 1RM'),
						),
						180,
					),
					ss(
						[
							ex('Barbell Incline Press', ...r(5, 3)),
							ex('DB RDLs', ...r(10, 3)),
						],
						120,
					),
					ss(
						[
							ex('DB Skullcrushers', ...r(10, 4)),
							ex('Close Grip Pushups', ...r(10, 4)),
						],
						120,
					),
					// Cardio: DB Front Raises + DB Rear Laterals
					ss([
						ex('DB Front Raises', ...r(20, 3)),
						ex('DB Rear Laterals', ...r(20, 3)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 3, Day 2 — Deadlift/Pull/Biceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: 'Warm up hips, low back, upper back',
				exerciseGroups: [
					ss(
						[
							ex(
								'Deadlift',
								se(2, '75% of Deadlift 1RM'),
								se(2, '80% of Deadlift 1RM'),
								se(2, '85% of Deadlift 1RM'),
								se(2, '85% of Deadlift 1RM'),
							),
							ex('DB Rear Laterals', ...r(20, 4)),
						],
						180,
					),
					solo(ex('1-Arm DB Row', ...r(5, 4)), 120),
					solo(
						ex('Chin Up', s(3, 'Slow & strict, add weight if possible'), s(3), s(3), s(3)),
						120,
					),
					solo(ex('Weighted Hyperextensions', ...r(7, 3)), 120),
					// Cardio: Alt. DB Curls + BB Shrugs
					ss([
						ex('Alt. DB Curls', s(5), s(5), s(10), s(10)),
						ex('Barbell Shrugs', ...r(10, 4)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 3, Day 3 — Squat/Bench/Shoulders
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: 'Get back and legs rolling',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							se(2, '75% of Back Squat 1RM'),
							se(2, '80% of Back Squat 1RM'),
							se(2, '85% of Back Squat 1RM'),
							se(2, '90% of Back Squat 1RM'),
							se(5, '70% of Back Squat 1RM'),
						),
						180,
					),
					solo(
						ex(
							'Bench Press',
							se(5, '70% of Bench 1RM'),
							se(5, '75% of Bench 1RM'),
							se(5, '80% of Bench 1RM'),
							se(5, '80% of Bench 1RM'),
							se(10, '70% of Bench 1RM'),
						),
						180,
					),
					solo(ex('DB Arnold Press', ...r(5, 4)), 120),
					ss(
						[
							ex('DB Laterals', ...r(10, 3)),
							ex('DB Rear Laterals', ...r(15, 3)),
						],
						120,
					),
					// Cardio: Cable or Band Pushdowns + DB Shrugs
					ss([
						ex('Cable or Band Pushdowns', ...r(25, 4)),
						ex('DB Shrugs', ...r(10, 4)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 3, Day 4 — Snatch Grip Deadlift/Back/Biceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: 'Get hips, low back, and legs loose — Goodmornings, KB Swings',
				exerciseGroups: [
					solo(
						ex(
							'Snatch Grip Deadlift',
							se(5, '50% of Deadlift 1RM'),
							se(5, '55% of Deadlift 1RM'),
							se(5, '60% of Deadlift 1RM'),
							se(5, '65% of Deadlift 1RM'),
						),
						180,
					),
					solo(ex('Reverse Grip Barbell Bent Over Rows', ...r(5, 4)), 120),
					solo(ex('DB Pullover', ...r(5, 4)), 120),
					solo(
						ex('Chest Supported 2-Arm DB Rows', s(10), s(10), s(5), s(5)),
						120,
					),
					// Cardio (split into sequential groups per PDF a/b/c structure)
					solo(ex('Barbell Curls', ...r(5, 3))),
					solo(ex('DB Rear Laterals', ...r(20, 3))),
					solo(ex('Barbell Curls', ...r(15, 3))),
				],
			},
		],
	},

	// ===========================================================================
	// WEEK 4
	// ===========================================================================
	{
		weekNumber: 4,
		days: [
			// -----------------------------------------------------------------------
			// Week 4, Day 1 — Bench/Squat/Accessory
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: 'Arm Swings, Lat Stretches, Empty Bar Presses, Light Pushdowns',
				exerciseGroups: [
					solo(
						ex(
							'Bench Press',
							se(4, '75% of Bench 1RM'),
							se(4, '80% of Bench 1RM'),
							se(4, '85% of Bench 1RM'),
							se(4, '85% of Bench 1RM'),
							se(4, '85% of Bench 1RM'),
							se(6, '60% of Bench 1RM'),
						),
						180,
					),
					solo(
						ex(
							'Back Squat',
							se(3, '70% of Back Squat 1RM'),
							se(3, '75% of Back Squat 1RM'),
							se(3, '80% of Back Squat 1RM'),
							se(3, '82% of Back Squat 1RM'),
							se(3, '80% of Back Squat 1RM'),
						),
						180,
					),
					ss(
						[
							ex('Barbell Incline Press', ...r(5, 3)),
							ex('DB RDLs', ...r(5, 3)),
						],
						120,
					),
					ss(
						[
							ex('DB Skullcrushers', ...r(5, 5)),
							ex('Close Grip Pushups', ...r(5, 5)),
						],
						120,
					),
					// Cardio: DB Laterals + DB Upright Rows
					ss([
						ex('DB Laterals', ...r(20, 3)),
						ex('DB Upright Rows', ...r(10, 3)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 4, Day 2 — Deadlift/Pull/Biceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: 'Bodyweight Goodmornings',
				exerciseGroups: [
					ss(
						[
							ex(
								'Deadlift',
								se(5, '75% of Deadlift 1RM'),
								se(5, '75% of Deadlift 1RM'),
								se(5, '75% of Deadlift 1RM'),
							),
							ex('Cable or Band Face Pulls', ...r(25, 3)),
						],
						180,
					),
					solo(
						ex('Pull Up', s(3, 'Weighted if possible'), s(3), s(3), s(3)),
						120,
					),
					solo(ex('1-Arm DB Row', ...r(5, 3)), 120),
					solo(ex('Weighted Hyperextensions', ...r(8, 3)), 120),
					// Cardio: Barbell 21s + DB Shrugs
					ss([
						ex('Barbell 21s', ...r(21, 3)),
						ex('DB Shrugs', ...r(10, 3)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 4, Day 3 — Squat/Bench/Shoulders
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: 'Lower legs, low back, ankles, arms, lats',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							...pct(5, [70, 70, 70, 70], 'Back Squat 1RM'),
						),
						180,
					),
					solo(
						ex(
							'Bench Press',
							se(10, '60% of Bench 1RM'),
							se(10, '65% of Bench 1RM'),
							se(10, '70% of Bench 1RM'),
						),
						180,
					),
					solo(ex('DB Arnold Press', ...r(5, 4)), 120),
					// Group 4 — only Bench Dips listed in PDF (labeled a/b but b is blank)
					solo(ex('Dips or Bench Dips', ...r(10, 4)), 120),
					// Cardio: DB Rear Laterals + BB Shrugs
					ss([
						ex('DB Rear Laterals', ...r(20, 3)),
						ex('Barbell Shrugs', ...r(10, 3)),
					]),
				],
			},

			// -----------------------------------------------------------------------
			// Week 4, Day 4 — Snatch Grip Deadlift/Back (no cardio per PDF)
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: 'Bodyweight Goodmornings, Lat Stretches, KB Swings',
				exerciseGroups: [
					solo(
						ex(
							'Snatch Grip Deadlift',
							se(4, '55% of Deadlift 1RM'),
							se(4, '60% of Deadlift 1RM'),
							se(4, '65% of Deadlift 1RM'),
							se(4, '70% of Deadlift 1RM'),
						),
						180,
					),
					solo(ex('DB Pullover', ...r(5, 3)), 120),
					solo(
						ex(
							'Reverse Grip Barbell Bent Over Rows',
							s(5), s(5), s(10), s(10), s(6),
						),
						120,
					),
					solo(
						ex(
							'Chest Supported 2-Arm DB Rows',
							s(5), s(5), s(10), s(10), s(20), s(20),
						),
						120,
					),
				],
			},
		],
	},
];

// ===========================================================================
// POOL SEASON 2 PROGRAM
// ===========================================================================

const POOL_SEASON_2_NAME = 'Pool Season 2';
const POOL_SEASON_2_DESCRIPTION =
	'A 4-week, 4-day/week strength and hypertrophy program. ' +
	'Alternates "Strong Pool Presence" days (heavy compound lifts) with "Turning Heads" days (bench-led supersets and arm work).';

const poolSeason2Weeks: WeekInput[] = [
	// ===========================================================================
	// WEEK 1
	// ===========================================================================
	{
		weekNumber: 1,
		days: [
			// -----------------------------------------------------------------------
			// Week 1, Day 1 — Squat / Bench / OHP (Strong Pool Presence)
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: 'Empty Bar Bench Press 4x20, Bodyweight Squats 1x10, Empty Bar Bent Rows 4x20',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							...pct(5, [60, 65, 70, 73], 'Back Squat 1RM'),
						),
						150,
					),
					solo(
						ex(
							'Bench Press',
							se(5, '65% of Bench 1RM'),
							se(5, '70% of Bench 1RM'),
							se(5, '75% of Bench 1RM'),
							se(5, '78% of Bench 1RM'),
							se(8, '70% of Bench 1RM'),
							se(8, '70% of Bench 1RM'),
							se(8, '70% of Bench 1RM'),
						),
						120,
					),
					solo(
						ex('Barbell Standing Overhead Press', s(8), s(8), s(8), s(8)),
						120,
					),
					ss(
						[
							ex('DB Front Raises', ...r(15, 3)),
							ex('DB Laterals', ...r(15, 3)),
							ex('DB Rear Laterals', ...r(15, 3)),
						],
						90,
					),
					ss(
						[
							ex('Cable or Band Pushdowns', ...r(25, 3)),
							ex('Close Grip Pushups', ...r(10, 3)),
						],
						90,
					),
				],
			},
			// -----------------------------------------------------------------------
			// Week 1, Day 2 — Deadlift / Chin Up / Back (Strong Pool Presence)
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: 'Empty Bar RDLs 3x10, Empty Bar Back Squats 3x10',
				exerciseGroups: [
					solo(
						ex(
							'Deadlift',
							se(5, '40% of Deadlift 1RM'),
							se(5, '75% of Deadlift 1RM'),
							se(3, '80% of Deadlift 1RM'),
							se(5, '72% of Deadlift 1RM'),
							se(5, '72% of Deadlift 1RM'),
							se(5, '72% of Deadlift 1RM'),
						),
						150,
					),
					ss(
						[
							ex('Chin Up', s(3), s(3), s(3)),
							ex('Snatch Grip Deadlift', ...r(5, 3)),
						],
						150,
					),
					solo(ex('DB Pullover', s(5), s(5), s(5), s(5)), 90),
					solo(ex('Barbell Shrugs', s(10), s(10), s(10), s(10)), 90),
					ss(
						[
							ex('Alt. DB Curls', s(5), s(5), s(5), s(5)),
							ex('Barbell Reverse Curls', s(20), s(20), s(20)),
						],
						90,
					),
				],
			},
			// -----------------------------------------------------------------------
			// Week 1, Day 3 — Squat / Back / Legs (Strong Pool Presence)
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: 'Empty Bar Back Squats 3x10, Arm Swings and Lat Stretches',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							se(5, '60% of Back Squat 1RM'),
							se(5, '60% of Back Squat 1RM'),
							se(5, '60% of Back Squat 1RM'),
							se(4, '70% of Back Squat 1RM'),
							se(4, '70% of Back Squat 1RM'),
							se(4, '70% of Back Squat 1RM'),
							se(3, '75% of Back Squat 1RM'),
							se(3, '75% of Back Squat 1RM'),
							se(3, '75% of Back Squat 1RM'),
						),
						150,
					),
					ss(
						[
							ex('Chest Supported 2-Arm DB Rows', ...r(20, 3)),
							ex('Band Pull Aparts', ...r(20, 3)),
							ex('DB RDLs', ...r(5, 3)),
						],
						90,
					),
					ss(
						[
							ex('Barbell RDLs', s(5), s(5), s(5)),
							ex('DB Shrugs', s(20), s(20), s(26)),
						],
						90,
					),
					solo(ex('DB Walking Lunges', ...r(10, 5)), 90),
				],
			},
			// -----------------------------------------------------------------------
			// Week 1, Day 4 — Bench / Shoulder / Arms (Turning Heads)
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: 'Empty Bar Bench Press 4x20, Empty Bar Bent Rows 4x10',
				exerciseGroups: [
					ss(
						[
							ex(
								'Bench Press',
								se(10, '50% of Bench 1RM'),
								se(10, '52% of Bench 1RM'),
								se(10, '55% of Bench 1RM'),
								se(10, '57% of Bench 1RM'),
								se(10, '60% of Bench 1RM'),
							),
							ex('Barbell Bent Over Rows', ...r(20, 5)),
						],
						180,
					),
					ss(
						[
							ex('Seated DB Shoulder Press', ...r(10, 4)),
							ex('1-Arm DB Row', ...r(8, 4)),
						],
						120,
					),
					ss(
						[
							ex('Close Grip Bench', ...r(10, 4)),
							ex('DB Zottman Curls', ...r(10, 4)),
						],
						120,
					),
					ss(
						[
							ex('Barbell Shrugs', ...r(10, 3)),
							ex('DB Shrugs', ...r(20, 3)),
							ex('Band Pull Aparts', ...r(20, 3)),
						],
						90,
					),
				],
			},
		],
	},
	// ===========================================================================
	// WEEK 2
	// ===========================================================================
	{
		weekNumber: 2,
		days: [
			// -----------------------------------------------------------------------
			// Week 2, Day 1 — Squat / Bench / OHP (Strong Pool Presence)
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: 'Empty Bar Bench Press 4x20, Bodyweight Squats 4x10, Empty Bar Bent Rows 4x20',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							...pct(5, [62, 67, 72, 75], 'Back Squat 1RM'),
						),
						150,
					),
					solo(
						ex(
							'Bench Press',
							se(3, '65% of Bench 1RM'),
							se(3, '75% of Bench 1RM'),
							se(3, '80% of Bench 1RM'),
							se(3, '82% of Bench 1RM'),
							se(3, '85% of Bench 1RM'),
							se(5, '75% of Bench 1RM'),
							se(5, '75% of Bench 1RM'),
						),
						120,
					),
					solo(
						ex('Barbell Standing Overhead Press', s(5), s(5), s(5), s(5)),
						120,
					),
					ss(
						[
							ex('DB Laterals', ...r(25, 4)),
							ex('Band Pull Aparts', ...r(25, 4)),
						],
						90,
					),
					solo(
						ex(
							'EZ Bar or Straight Bar Skullcrushers',
							s(10), s(10), s(15), s(15), s(20), s(20),
						),
						90,
					),
				],
			},
			// -----------------------------------------------------------------------
			// Week 2, Day 2 — Deadlift / Chin Up / Back (Strong Pool Presence)
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: 'Empty Bar RDLs 3x10, Empty Bar Back Squats 3x10',
				exerciseGroups: [
					solo(
						ex(
							'Deadlift',
							se(5, '65% of Deadlift 1RM'),
							se(4, '75% of Deadlift 1RM'),
							se(3, '80% of Deadlift 1RM'),
							se(2, '85% of Deadlift 1RM'),
							se(1, '90% of Deadlift 1RM'),
							se(5, '75% of Deadlift 1RM'),
							se(5, '75% of Deadlift 1RM'),
						),
						150,
					),
					ss(
						[
							ex('Chin Up', s(3), s(3), s(3), s(3)),
							ex('Snatch Grip Deadlift', ...r(5, 4)),
						],
						150,
					),
					solo(ex('DB Pullover', s(5), s(5), s(5), s(5)), 90),
					solo(ex('DB Shrugs', s(20), s(20), s(20)), 90),
					ss(
						[
							ex('DB Concentration Curls', ...r(15, 3)),
							ex('Barbell Curls', s(5), s(5), s(5)),
						],
						90,
					),
				],
			},
			// -----------------------------------------------------------------------
			// Week 2, Day 3 — Squat / Back / Legs (Strong Pool Presence)
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: 'Empty Bar Back Squats 3x10, Arm Swings and Lat Stretches',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							se(4, '60% of Back Squat 1RM'),
							se(4, '65% of Back Squat 1RM'),
							se(4, '70% of Back Squat 1RM'),
							se(2, '75% of Back Squat 1RM'),
							se(2, '80% of Back Squat 1RM'),
							se(2, '85% of Back Squat 1RM'),
							se(5, '77% of Back Squat 1RM'),
							se(5, '77% of Back Squat 1RM'),
						),
						150,
					),
					ss(
						[
							ex('Chest Supported 2-Arm DB Rows', ...r(20, 4)),
							ex('Band Pull Aparts', s(26), s(20), s(20), s(20)),
						],
						90,
					),
					ss(
						[
							ex('Barbell RDLs', ...r(5, 4)),
							ex('DB Shrugs', ...r(20, 4)),
						],
						90,
					),
					solo(
						ex(
							'Bodyweight Wall Sits',
							...Array.from({ length: 6 }, () =>
								s(1, '20 seconds on, 20 seconds off'),
							),
						),
						90,
					),
				],
			},
			// -----------------------------------------------------------------------
			// Week 2, Day 4 — Bench / Shoulder / Arms (Turning Heads)
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: 'Empty Bar Bench Press 4x20, Empty Bar Bent Rows 4x10',
				exerciseGroups: [
					ss(
						[
							ex(
								'Bench Press',
								se(11, '50% of Bench 1RM'),
								se(11, '52% of Bench 1RM'),
								se(11, '55% of Bench 1RM'),
								se(11, '57% of Bench 1RM'),
								se(11, '60% of Bench 1RM'),
							),
							ex(
								'Reverse Grip Barbell Bent Over Rows',
								...r(15, 5),
							),
						],
						180,
					),
					ss(
						[
							ex('Seated DB Shoulder Press', ...r(12, 4)),
							ex('1-Arm DB Row', ...r(8, 4)),
						],
						120,
					),
					ss(
						[
							ex('Cable or Band Pushdowns', ...r(20, 4)),
							ex('Close Grip Pushups', ...r(10, 4)),
						],
						120,
					),
					ss(
						[
							ex('DB Shrugs', ...r(20, 5)),
							ex('DB Zottman Curls', ...r(15, 5)),
						],
						90,
					),
				],
			},
		],
	},
	// ===========================================================================
	// WEEK 3
	// ===========================================================================
	{
		weekNumber: 3,
		days: [
			// -----------------------------------------------------------------------
			// Week 3, Day 1 — Squat / Bench / OHP (Strong Pool Presence)
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: 'Empty Bar Bench Press 4x20, Bodyweight Squats 4x10, Empty Bar Bent Rows 4x20',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							...pct(6, [60, 65, 70, 73], 'Back Squat 1RM'),
						),
						150,
					),
					solo(
						ex(
							'Bench Press',
							se(5, '65% of Bench 1RM'),
							se(5, '72% of Bench 1RM'),
							se(5, '77% of Bench 1RM'),
							se(5, '80% of Bench 1RM'),
							se(8, '72% of Bench 1RM'),
							se(8, '72% of Bench 1RM'),
						),
						120,
					),
					solo(
						ex('Barbell Standing Overhead Press', s(8), s(8), s(8), s(8)),
						120,
					),
					ss(
						[
							ex('DB Front Raises', ...r(15, 3)),
							ex('DB Laterals', ...r(15, 3)),
							ex('DB Rear Laterals', ...r(15, 3)),
						],
						90,
					),
					solo(ex('Dips or Bench Dips', ...r(10, 5)), 90),
				],
			},
			// -----------------------------------------------------------------------
			// Week 3, Day 2 — Deadlift / Pull-Up / Back (Strong Pool Presence)
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: 'Empty Bar RDLs 3x10, Empty Bar Back Squats 3x10',
				exerciseGroups: [
					solo(
						ex(
							'Deadlift',
							se(5, '65% of Deadlift 1RM'),
							se(4, '75% of Deadlift 1RM'),
							se(3, '80% of Deadlift 1RM'),
							se(2, '85% of Deadlift 1RM'),
							se(1, '90% of Deadlift 1RM'),
							se(5, '80% of Deadlift 1RM'),
						),
						150,
					),
					ss(
						[
							ex('Pull Up', s(4), s(4), s(4)),
							ex('Snatch Grip Deadlift', ...r(6, 3)),
						],
						150,
					),
					solo(ex('1-Arm DB Row', ...r(5, 4)), 90),
					solo(ex('Barbell Shrugs', s(10), s(10), s(10), s(10)), 90),
					ss(
						[
							ex('Barbell 21s', s(21), s(21), s(21)),
							ex('DB Hammer Curls', ...r(20, 3)),
						],
						90,
					),
				],
			},
			// -----------------------------------------------------------------------
			// Week 3, Day 3 — Squat / Back (Strong Pool Presence)
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: 'Empty Bar Back Squats 3x10, Arm Swings and Lat Stretches',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							se(5, '60% of Back Squat 1RM'),
							se(5, '65% of Back Squat 1RM'),
							se(5, '70% of Back Squat 1RM'),
							se(3, '75% of Back Squat 1RM'),
							se(3, '80% of Back Squat 1RM'),
							se(3, '85% of Back Squat 1RM'),
							se(5, '80% of Back Squat 1RM'),
						),
						150,
					),
					ss(
						[
							ex('Bodyweight Inverted Rows', ...r(10, 4)),
							ex('DB Rear Laterals', ...r(20, 4)),
						],
						90,
					),
					ss(
						[
							ex('Barbell RDLs', ...r(6, 4)),
							ex('Barbell Shrugs', ...r(10, 4)),
						],
						90,
					),
					solo(ex('DB Walking Lunges', ...r(12, 4)), 90),
				],
			},
			// -----------------------------------------------------------------------
			// Week 3, Day 4 — Bench / Shoulder / Arms (Turning Heads)
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: 'Empty Bar Bench Press 4x20, Empty Bar Bent Rows 4x10',
				exerciseGroups: [
					ss(
						[
							ex(
								'Bench Press',
								se(5, '55% of Bench 1RM'),
								se(5, '60% of Bench 1RM'),
								se(5, '62% of Bench 1RM'),
								se(5, '65% of Bench 1RM'),
								se(5, '70% of Bench 1RM'),
							),
							ex('Barbell Bent Over Rows', ...r(16, 5)),
						],
						180,
					),
					ss(
						[
							ex('Seated DB Shoulder Press', ...r(8, 4)),
							ex('Chin Up', ...r(4, 4)),
						],
						120,
					),
					ss(
						[
							ex('Close Grip Bench', ...r(8, 4)),
							ex('Barbell Curls', ...r(16, 4)),
						],
						120,
					),
					ss(
						[
							ex('Barbell Shrugs', ...r(10, 3)),
							ex('DB Shrugs', ...r(20, 3)),
							ex('Band Pull Aparts', ...r(20, 3)),
						],
						90,
					),
				],
			},
		],
	},
	// ===========================================================================
	// WEEK 4
	// ===========================================================================
	{
		weekNumber: 4,
		days: [
			// -----------------------------------------------------------------------
			// Week 4, Day 1 — Squat / Bench / OHP (Strong Pool Presence)
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: 'Empty Bar Bench Press 4x20, Bodyweight Squats 4x10, Empty Bar Bent Rows 4x20',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							...pct(6, [62, 67, 72, 75], 'Back Squat 1RM'),
						),
						150,
					),
					solo(
						ex(
							'Bench Press',
							se(2, '70% of Bench 1RM'),
							se(2, '75% of Bench 1RM'),
							se(2, '80% of Bench 1RM'),
							se(2, '85% of Bench 1RM'),
							se(2, '90% of Bench 1RM'),
							se(4, '80% of Bench 1RM'),
							se(4, '80% of Bench 1RM'),
							se(4, '80% of Bench 1RM'),
						),
						120,
					),
					solo(
						ex('Barbell Standing Overhead Press', s(5), s(5), s(5), s(5)),
						120,
					),
					ss(
						[
							ex('DB Laterals', ...r(25, 4)),
							ex('Band Pull Aparts', ...r(25, 4)),
						],
						90,
					),
					solo(
						ex(
							'EZ Bar or Straight Bar Skullcrushers',
							s(8), s(8), s(10), s(10), s(15), s(15), s(15), s(15),
						),
						90,
					),
				],
			},
			// -----------------------------------------------------------------------
			// Week 4, Day 2 — Deadlift / Pull-Up / Back (Strong Pool Presence)
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: 'Empty Bar RDLs 3x10, Empty Bar Back Squats 3x10',
				exerciseGroups: [
					solo(
						ex(
							'Deadlift',
							se(5, '65% of Deadlift 1RM'),
							se(4, '75% of Deadlift 1RM'),
							se(4, '80% of Deadlift 1RM'),
							se(3, '85% of Deadlift 1RM'),
							se(2, '90% of Deadlift 1RM'),
							se(5, '75% of Deadlift 1RM'),
						),
						150,
					),
					ss(
						[
							ex('Pull Up', s(4), s(4), s(4), s(4)),
							ex('Snatch Grip Deadlift', ...r(6, 4)),
						],
						150,
					),
					solo(ex('1-Arm DB Row', ...r(6, 5)), 90),
					solo(ex('DB Shrugs', s(20), s(20), s(20), s(20)), 90),
					ss(
						[
							ex('Barbell 21s', s(21), s(21), s(21)),
							ex('Barbell Reverse Curls', s(20), s(20)),
						],
						90,
					),
				],
			},
			// -----------------------------------------------------------------------
			// Week 4, Day 3 — Squat / Back (Strong Pool Presence)
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: 'Empty Bar Back Squats 3x10, Arm Swings and Lat Stretches',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							se(4, '65% of Back Squat 1RM'),
							se(4, '72% of Back Squat 1RM'),
							se(2, '80% of Back Squat 1RM'),
							se(2, '85% of Back Squat 1RM'),
							se(2, '90% of Back Squat 1RM'),
							se(5, '80% of Back Squat 1RM'),
						),
						150,
					),
					ss(
						[
							ex('Bodyweight Inverted Rows', ...r(12, 4)),
							ex('DB Rear Laterals', ...r(20, 4)),
						],
						90,
					),
					ss(
						[
							ex('Barbell RDLs', ...r(6, 4)),
							ex('DB Shrugs', ...r(20, 4)),
						],
						90,
					),
					solo(
						ex(
							'Bodyweight Wall Sits',
							...Array.from({ length: 6 }, () =>
								s(1, '25 seconds on, 25 seconds off'),
							),
						),
						90,
					),
				],
			},
			// -----------------------------------------------------------------------
			// Week 4, Day 4 — Bench / Shoulder / Arms (Turning Heads)
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: 'Empty Bar Bench Press 4x20, Empty Bar Bent Rows 4x10',
				exerciseGroups: [
					ss(
						[
							ex(
								'Bench Press',
								se(9, '55% of Bench 1RM'),
								se(9, '60% of Bench 1RM'),
								se(9, '63% of Bench 1RM'),
								se(9, '65% of Bench 1RM'),
								se(9, '70% of Bench 1RM'),
							),
							ex('Reverse Grip Barbell Bent Over Rows', ...r(12, 5)),
						],
						180,
					),
					ss(
						[
							ex('Seated DB Shoulder Press', ...r(10, 4)),
							ex('Chin Up', ...r(5, 4)),
						],
						120,
					),
					ss(
						[
							ex('Cable or Band Pushdowns', ...r(20, 4)),
							ex('Close Grip Pushups', ...r(10, 4)),
						],
						120,
					),
					ss(
						[
							ex('DB Shrugs', ...r(20, 5)),
							ex('DB Zottman Curls', ...r(15, 5)),
						],
						90,
					),
				],
			},
		],
	},
];

// ===========================================================================
// POOL SEASON PROGRAM
// ===========================================================================

const POOL_SEASON_NAME = 'Pool Season';
const POOL_SEASON_DESCRIPTION =
	'A 4-week, 4-day/week strength program. ' +
	'Progressive periodization built around Back Squat, Bench Press, and Deadlift with accessory supersets and cardio finishers each session.';

const poolSeasonWeeks: WeekInput[] = [
	// ===========================================================================
	// WEEK 1
	// ===========================================================================
	{
		weekNumber: 1,
		days: [
			// -----------------------------------------------------------------------
			// Week 1, Day 1 — Squat / Bench / Arms
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: 'Lat stretches mixed with empty bar Bench Press x20, 3-4 rounds',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							...pct(3, [60, 65, 70, 75], 'Back Squat 1RM'),
						),
						150,
					),
					solo(
						ex(
							'Bench Press',
							se(4, '60% of Bench 1RM'),
							se(4, '70% of Bench 1RM'),
							se(4, '75% of Bench 1RM'),
							se(4, '80% of Bench 1RM'),
							se(4, '80% of Bench 1RM'),
							se(10, '60% of Bench 1RM'),
						),
						120,
					),
					solo(
						ex('1-Arm DB Row', s(5), s(5), s(5), s(5), s(10)),
						120,
					),
					ss(
						[
							ex('EZ Bar or Straight Bar Skullcrushers', ...r(10, 3)),
							ex('Close Grip Pushups', ...r(10, 3)),
						],
						90,
					),
					ss(
						[
							ex('Barbell Upright Rows', s(15), s(15), s(15), s(20)),
							ex('DB Laterals', ...r(20, 3)),
						],
						90,
					),
				],
			},
			// -----------------------------------------------------------------------
			// Week 1, Day 2 — Deadlift / OHP / Back
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: 'Empty Bar RDLs x10, Empty Bar Bent Rows x20, 3-4 rounds',
				exerciseGroups: [
					solo(
						ex(
							'Deadlift',
							...pct(5, [60, 65, 70, 75], 'Deadlift 1RM'),
							se(10, '55% of Deadlift 1RM'),
						),
						150,
					),
					solo(
						ex('Barbell Standing Overhead Press', s(8), s(8), s(8)),
						120,
					),
					ss(
						[
							ex('Chin Up', ...r(3, 4)),
							ex('DB Pullover', ...r(5, 4)),
						],
						120,
					),
					solo(ex('Barbell 21s', ...r(21, 4)), 90),
					solo(ex('Barbell Shrugs', ...r(25, 4)), 90),
				],
			},
			// -----------------------------------------------------------------------
			// Week 1, Day 3 — Squat / Back / Arms
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: 'Empty Bar Squats 3x10, Arm Swings and Lat Stretches',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							se(5, '55% of Back Squat 1RM'),
							se(5, '60% of Back Squat 1RM'),
							se(5, '65% of Back Squat 1RM'),
							se(3, '70% of Back Squat 1RM'),
							se(3, '75% of Back Squat 1RM'),
							se(3, '85% of Back Squat 1RM'),
							se(5, '70% of Back Squat 1RM'),
							se(5, '75% of Back Squat 1RM'),
						),
						150,
					),
					solo(
						ex(
							'Chest Supported 2-Arm DB Rows',
							s(10), s(10), s(5), s(5), s(5), s(20),
						),
						120,
					),
					ss(
						[
							ex('DB Hammer Curls', ...r(20, 4)),
							ex('Cable or Band Pushdowns', ...r(20, 4)),
						],
						90,
					),
					solo(ex('DB Rear Laterals', ...r(20, 4)), 90),
				],
			},
			// -----------------------------------------------------------------------
			// Week 1, Day 4 — Bench / Back / Arms
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: 'Empty Bar Bench Press x20 4 rounds, Arm Swings & Lat Stretches',
				exerciseGroups: [
					ss(
						[
							ex(
								'Bench Press',
								se(20, '45% of Bench 1RM'),
								se(15, '50% of Bench 1RM'),
								se(15, '50% of Bench 1RM'),
								se(10, '55% of Bench 1RM'),
								se(10, '55% of Bench 1RM'),
							),
							ex(
								'Barbell Bent Over Rows',
								s(10), s(10), s(15), s(15), s(20), s(20),
							),
						],
						120,
					),
					ss(
						[
							ex('DB Arnold Press', ...r(10, 3)),
							ex('Cable or Band Face Pulls', ...r(20, 3)),
						],
						90,
					),
					ss(
						[
							ex('Close Grip Pushups', ...r(10, 4)),
							ex('Barbell Curls', s(10), s(10), s(16), s(10)),
						],
						90,
					),
					ss(
						[
							ex('EZ Bar or Straight Bar Skullcrushers', ...r(25, 4)),
							ex('DB Hammer Curls', ...r(25, 4)),
						],
						90,
					),
					solo(
						ex('DB Shrugs', s(200, 'Complete 200 reps in as few sets as possible')),
						180,
					),
				],
			},
		],
	},
	// ===========================================================================
	// WEEK 2
	// ===========================================================================
	{
		weekNumber: 2,
		days: [
			// -----------------------------------------------------------------------
			// Week 2, Day 1 — Squat / Bench / Triceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: 'Arm Swings & empty bar Bench Press x20, 4 rounds',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							se(2, '60% of Back Squat 1RM'),
							se(2, '70% of Back Squat 1RM'),
							se(2, '75% of Back Squat 1RM'),
							se(2, '80% of Back Squat 1RM'),
							se(2, '80% of Back Squat 1RM'),
							se(2, '60% of Back Squat 1RM'),
							se(2, '75% of Back Squat 1RM'),
							se(2, '75% of Back Squat 1RM'),
							se(2, '80% of Back Squat 1RM'),
							se(2, '80% of Back Squat 1RM'),
						),
						150,
					),
					solo(
						ex(
							'Bench Press',
							se(5, '60% of Bench 1RM'),
							se(5, '75% of Bench 1RM'),
							se(5, '75% of Bench 1RM'),
							se(5, '80% of Bench 1RM'),
							se(5, '80% of Bench 1RM'),
							se(0, '62.5% of Bench 1RM', 'AMRAP — minimum 10 reps'),
						),
						120,
					),
					solo(
						ex('DB Pullover', s(5), s(5), s(5), s(5), s(0, 'AMRAP')),
						120,
					),
					ss(
						[
							ex('Dips or Bench Dips', s(0, 'AMRAP'), s(0, 'AMRAP'), s(0, 'AMRAP')),
							ex('DB Triceps Kickbacks', ...r(10, 3)),
						],
						150,
					),
					ss(
						[
							ex('DB Front Raises', ...r(20, 2)),
							ex('DB Laterals', ...r(20, 2)),
						],
						90,
					),
				],
			},
			// -----------------------------------------------------------------------
			// Week 2, Day 2 — Deadlift / OHP / Back
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: 'DB Goblet Squats light 3x5, Empty Bar RDLs & Bent Rows 3x10',
				exerciseGroups: [
					solo(
						ex(
							'Deadlift',
							se(3, '65% of Deadlift 1RM'),
							se(3, '70% of Deadlift 1RM'),
							se(3, '75% of Deadlift 1RM'),
							se(2, '85% of Deadlift 1RM'),
							se(2, '85% of Deadlift 1RM'),
							se(2, '85% of Deadlift 1RM'),
							se(5, '50% of Deadlift 1RM'),
						),
						150,
					),
					solo(
						ex('Barbell Standing Overhead Press', s(5), s(5), s(5), s(10)),
						120,
					),
					solo(ex('Pull Up', ...r(3, 4)), 120),
					ss(
						[
							ex('Chest Supported 2-Arm DB Rows', s(10), s(10), s(20)),
							ex('Barbell Curls', s(10), s(10), s(20)),
						],
						120,
					),
					solo(ex('DB Rear Laterals', ...r(20, 4)), 90),
				],
			},
			// -----------------------------------------------------------------------
			// Week 2, Day 3 — Squat / Back / Shoulders
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: 'Empty Bar Squats & RDLs 3x10, Lat Stretches',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							se(5, '50% of Back Squat 1RM'),
							se(3, '60% of Back Squat 1RM'),
							se(3, '70% of Back Squat 1RM'),
							se(2, '80% of Back Squat 1RM'),
							se(2, '80% of Back Squat 1RM'),
							se(2, '80% of Back Squat 1RM'),
							se(2, '80% of Back Squat 1RM'),
							se(2, '80% of Back Squat 1RM'),
							se(2, '80% of Back Squat 1RM'),
							se(2, '80% of Back Squat 1RM'),
							se(2, '80% of Back Squat 1RM'),
						),
						150,
					),
					solo(
						ex('1-Arm DB Row', s(5), s(5), s(5), s(5), s(10), s(10)),
						120,
					),
					solo(ex('Barbell 21s', ...r(21, 4)), 90),
					solo(ex('Barbell Shrugs', ...r(10, 4)), 90),
					solo(ex('DB Upright Rows', ...r(25, 3)), 90),
				],
			},
			// -----------------------------------------------------------------------
			// Week 2, Day 4 — Bench / Back / Arms
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: 'Empty Bar Bench Press 4x20, Lat Stretches & Arm Swings',
				exerciseGroups: [
					ss(
						[
							ex('DB Incline Press', ...r(10, 4)),
							ex('Chest Supported 2-Arm DB Rows', ...r(10, 4)),
						],
						150,
					),
					ss(
						[
							ex('DB Arnold Press', ...r(8, 3)),
							ex('DB Rear Laterals', ...r(20, 3)),
						],
						90,
					),
					ss(
						[
							ex('Close Grip Bench', s(10), s(10), s(15), s(20)),
							ex('Alt. DB Curls', s(5), s(5), s(5), s(10)),
						],
						90,
					),
					ss(
						[
							ex('Cable or Band Pushdowns', ...r(25, 4)),
							ex('DB Hammer Curls', ...r(25, 4)),
						],
						90,
					),
					solo(ex('Cable or Band Face Pulls', ...r(25, 3)), 90),
				],
			},
		],
	},
	// ===========================================================================
	// WEEK 3
	// ===========================================================================
	{
		weekNumber: 3,
		days: [
			// -----------------------------------------------------------------------
			// Week 3, Day 1 — Squat / Bench / Triceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: 'Empty Bar Bench 4x20, Arm Swings & Lat Stretches',
				exerciseGroups: [
					solo(
						ex('Back Squat', ...pct(5, [60, 60, 60], 'Back Squat 1RM')),
						180,
					),
					solo(
						ex(
							'Bench Press',
							se(5, '60% of Bench 1RM'),
							se(3, '70% of Bench 1RM'),
							se(3, '85% of Bench 1RM'),
							se(3, '85% of Bench 1RM'),
							se(3, '85% of Bench 1RM'),
							se(2, '85% of Bench 1RM'),
							se(2, '85% of Bench 1RM'),
							se(5, '50% of Bench 1RM', 'AMRAP — minimum 5 reps'),
						),
						180,
					),
					solo(ex('1-Arm DB Row', ...r(5, 4)), 120),
					solo(
						ex(
							'Cable or Band Pushdowns',
							s(10), s(10), s(10), s(10), s(10),
							s(25), s(25), s(25),
						),
						90,
					),
					solo(ex('DB Shrugs', ...r(25, 4)), 90),
				],
			},
			// -----------------------------------------------------------------------
			// Week 3, Day 2 — Deadlift / Back
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: 'Empty Bar Squats 3x10, Empty Bar RDLs + Rows 3x10, Lat Stretches',
				exerciseGroups: [
					solo(
						ex(
							'Snatch Grip Deadlift',
							...pct(5, [50, 55, 55], 'Deadlift 1RM'),
						),
						150,
					),
					solo(
						ex(
							'Deadlift',
							...pct(3, [70, 75, 75, 75], 'Deadlift 1RM'),
						),
						150,
					),
					solo(
						ex(
							'Chest Supported 2-Arm DB Rows',
							s(5), s(5), s(5), s(10), s(10), s(10), s(20),
						),
						120,
					),
					solo(ex('Barbell Curls', s(5), s(5), s(5)), 90),
					solo(ex('Barbell Shrugs', ...r(20, 4)), 90),
				],
			},
			// -----------------------------------------------------------------------
			// Week 3, Day 3 — Squat / Back / Arms
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: 'Empty Bar Rows & Lat-to-Lats 3x10, Empty Bar Squats 3x5',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							se(3, '70% of Back Squat 1RM'),
							se(4, '70% of Back Squat 1RM'),
							se(5, '70% of Back Squat 1RM'),
							se(2, '75% of Back Squat 1RM'),
							se(3, '75% of Back Squat 1RM'),
							se(1, '75% of Back Squat 1RM'),
							se(1, '80% of Back Squat 1RM'),
							se(2, '80% of Back Squat 1RM'),
							se(3, '80% of Back Squat 1RM'),
						),
						150,
					),
					solo(ex('DB Pullover', s(5), s(5), s(5), s(10)), 120),
					solo(ex('DB Concentration Curls', ...r(10, 4)), 90),
					solo(ex('DB RDLs', ...r(10, 4)), 120),
					solo(ex('DB Rear Laterals', ...r(20, 4)), 90),
				],
			},
			// -----------------------------------------------------------------------
			// Week 3, Day 4 — Bench / OHP / Arms
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: 'Arm Swings, empty bar Bench Press 4x20, Lat Stretches',
				exerciseGroups: [
					ss(
						[
							ex(
								'Bench Press',
								se(10, '50% of Bench 1RM'),
								se(10, '55% of Bench 1RM'),
								se(10, '60% of Bench 1RM'),
								se(10, '65% of Bench 1RM'),
							),
							ex('Chin Up', ...r(5, 4)),
						],
						150,
					),
					ss(
						[
							ex('Barbell Standing Overhead Press', s(5), s(5), s(5), s(10)),
							ex('1-Arm DB Row', s(5), s(5), s(5), s(10)),
						],
						120,
					),
					ss(
						[
							ex('Barbell Upright Rows', ...r(10, 3)),
							ex('DB Curl to Overhead Press', ...r(10, 3)),
						],
						90,
					),
					ss(
						[
							ex('EZ Bar or Straight Bar Skullcrushers', ...r(20, 3)),
							ex('Barbell 21s', ...r(21, 3)),
						],
						90,
					),
				],
			},
		],
	},
	// ===========================================================================
	// WEEK 4
	// ===========================================================================
	{
		weekNumber: 4,
		days: [
			// -----------------------------------------------------------------------
			// Week 4, Day 1 — Squat / Bench / Triceps
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: 'Empty Bar Bench Press 4x20, Lat Stretches & Arm Swings',
				exerciseGroups: [
					solo(
						ex('Back Squat', ...pct(3, [65, 70, 75], 'Back Squat 1RM')),
						180,
					),
					solo(
						ex(
							'Bench Press',
							se(3, '60% of Bench 1RM'),
							se(3, '70% of Bench 1RM'),
							se(3, '80% of Bench 1RM'),
							se(4, '60% of Bench 1RM'),
							se(4, '70% of Bench 1RM'),
							se(4, '80% of Bench 1RM'),
							se(5, '60% of Bench 1RM'),
							se(5, '70% of Bench 1RM'),
							se(5, '80% of Bench 1RM'),
						),
						180,
					),
					solo(ex('DB Pullover', s(5), s(5), s(5), s(10)), 120),
					solo(
						ex('Dips or Bench Dips', s(10), s(10), s(10), s(0, 'AMRAP')),
						120,
					),
					solo(ex('Barbell Shrugs', s(10), s(10), s(10), s(25)), 90),
				],
			},
			// -----------------------------------------------------------------------
			// Week 4, Day 2 — Deadlift / Pull-Up / Arms
			// -----------------------------------------------------------------------
			{
				dayNumber: 2,
				warmUp: 'Empty Bar Squats, Rows, RDLs 3x5 each',
				exerciseGroups: [
					solo(
						ex(
							'Deadlift',
							se(2, '60% of Deadlift 1RM'),
							se(2, '70% of Deadlift 1RM'),
							se(2, '80% of Deadlift 1RM'),
							se(3, '60% of Deadlift 1RM'),
							se(3, '70% of Deadlift 1RM'),
							se(3, '80% of Deadlift 1RM'),
							se(4, '60% of Deadlift 1RM'),
							se(4, '70% of Deadlift 1RM'),
							se(4, '80% of Deadlift 1RM'),
						),
						150,
					),
					solo(
						ex(
							'Chin Up',
							s(3), s(3), s(3), s(3), s(3),
							s(0, 'AMRAP, bodyweight only'),
						),
						120,
					),
					solo(ex('Alt. DB Curls', ...r(5, 5)), 90),
					solo(ex('DB Hammer Curls', ...r(25, 4)), 90),
				],
			},
			// -----------------------------------------------------------------------
			// Week 4, Day 3 — Squat / Back / Arms
			// -----------------------------------------------------------------------
			{
				dayNumber: 3,
				warmUp: 'Empty Bar RDLs, Squats, Rows 3x5, Lat Stretches, Arm Swings',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							se(5, '50% of Back Squat 1RM'),
							se(5, '60% of Back Squat 1RM'),
							se(3, '70% of Back Squat 1RM'),
							se(3, '75% of Back Squat 1RM'),
							se(2, '85% of Back Squat 1RM'),
							se(2, '85% of Back Squat 1RM'),
							se(2, '85% of Back Squat 1RM'),
							se(2, '85% of Back Squat 1RM'),
							se(2, '85% of Back Squat 1RM'),
						),
						150,
					),
					solo(ex('1-Arm DB Row', ...r(5, 3)), 120),
					solo(ex('Barbell Curls', ...r(10, 3)), 90),
					solo(ex('Barbell RDLs', ...r(5, 3)), 120),
					solo(ex('DB Rear Laterals', ...r(25, 3)), 90),
				],
			},
			// -----------------------------------------------------------------------
			// Week 4, Day 4 — Full Body Circuit
			// -----------------------------------------------------------------------
			{
				dayNumber: 4,
				warmUp: 'Arm Swings, Lat Stretches',
				exerciseGroups: [
					ss(
						[
							ex('Bench Press', ...r(10, 5)),
							ex('Alt. DB Curls', ...r(10, 5)),
							ex('Chest Supported 2-Arm DB Rows', ...r(10, 5)),
							ex('DB Hammer Curls', ...r(10, 5)),
							ex('Close Grip Pushups', ...r(10, 5)),
							ex('Dips or Bench Dips', ...r(10, 5)),
						],
						210,
					),
				],
			},
		],
	},
];

// ===========================================================================
// OAK TREE PROGRAM
// ===========================================================================

const OAK_TREE_NAME = 'Oak Tree';
const OAK_TREE_DESCRIPTION =
	'A 20-day undulating strength block. ' +
	'Percentage-based work on the big three lifts paired with superset accessories ' +
	'and cardio finishers, organized into 5 weeks of 4 days.';

const oakTreeWeeks: WeekInput[] = [
	// ===========================================================================
	// WEEK 1 (Days 1-4)
	// ===========================================================================
	{
		weekNumber: 1,
		days: [
			// Week 1, Day 1
			{
				dayNumber: 1,
				warmUp:
					'2-3 rounds SS: Empty Bar RDLs x10 / 5 Pushups / Empty Bar Squats x5',
				exerciseGroups: [
					ss(
						[
							ex('Deadlift', ...pct(5, [60, 65, 70, 70], 'Deadlift 1RM')),
							ex('Cable or Band Face Pulls', ...r(15, 4)),
						],
						165,
					),
					solo(
						ex(
							'Bench Press',
							...pct(5, [60, 65, 70], 'Bench 1RM'),
							...pct(3, [75, 80, 85], 'Bench 1RM'),
							...pct(5, [65, 70, 75], 'Bench 1RM'),
						),
						165,
					),
					solo(
						ex('EZ Bar or Straight Bar Skullcrushers', ...r(10, 5)),
						165,
					),
					// cardio finisher
					ss([
						ex('DB Rear Laterals', ...r(20, 3)),
						ex('DB Shrugs', ...r(20, 3)),
					]),
				],
			},
			// Week 1, Day 2
			{
				dayNumber: 2,
				warmUp:
					'3 rounds SS: Empty Bar Squats x10 / Empty Bar Bent Over Rows x10',
				exerciseGroups: [
					ss(
						[
							ex(
								'Back Squat',
								se(10, '50% of Back Squat 1RM'),
								se(8, '60% of Back Squat 1RM'),
								se(6, '70% of Back Squat 1RM'),
								se(4, '75% of Back Squat 1RM'),
								se(2, '80% of Back Squat 1RM'),
							),
							ex('DB Pullover', s(5), s(5), s(5), s(8), s(8)),
						],
						165,
					),
					ss(
						[
							ex('DB RDLs', ...r(10, 4)),
							ex(
								'Chin Up',
								s(3, 'weighted'),
								s(3, 'weighted'),
								s(3, 'weighted'),
								s(3, 'weighted'),
							),
						],
						165,
					),
					solo(ex('Chest Supported 2-Arm DB Rows', ...r(15, 3)), 165),
					// cardio finisher
					ss([
						ex(
							'Alt. DB Curls',
							s(5, 'heavy'),
							s(5, 'heavy'),
							s(5, 'heavy'),
							s(5, 'heavy'),
						),
						ex('Barbell Shrugs', ...r(10, 4)),
					]),
				],
			},
			// Week 1, Day 3
			{
				dayNumber: 3,
				warmUp:
					'3-4 rounds SS: Empty Bar Overhead Press x10 / Lat Stretches',
				exerciseGroups: [
					solo(
						ex(
							'Barbell Standing Overhead Press',
							s(6, 'Start ~30-32% of Bench 1RM; hold this weight as reps climb'),
							s(7),
							s(8),
							s(9),
							s(10),
						),
						165,
					),
					// "Big 33's"
					ss(
						[
							ex('DB Laterals', ...r(11, 3)),
							ex('DB Rear Laterals', ...r(11, 3)),
							ex('DB Upright Rows', ...r(11, 3)),
						],
						165,
					),
					solo(
						ex('Cable or Band Overhead Triceps Extensions', ...r(25, 5)),
						165,
					),
					// cardio finisher
					solo(ex('DB Triceps Kickbacks', ...r(10, 3))),
				],
			},
			// Week 1, Day 4
			{
				dayNumber: 4,
				warmUp:
					'3 rounds SS: Empty Bar RDLs x5 / Empty Bar Bent Over Rows x10',
				exerciseGroups: [
					solo(
						ex(
							'Deadlift',
							...pct(5, [60, 70], 'Deadlift 1RM'),
							...pct(3, [75, 80, 85], 'Deadlift 1RM'),
							...pct(5, [75, 75], 'Deadlift 1RM'),
						),
						165,
					),
					solo(ex('1-Arm DB Row', ...r(5, 4)), 165),
					solo(
						ex('Snatch Grip Deadlift', ...pct(3, [45, 45, 45], 'Deadlift 1RM')),
						165,
					),
					// cardio finisher
					ss([
						ex('Cable or Band Face Pulls', ...r(15, 3)),
						ex('Wide Grip Barbell Curls', ...r(15, 3)),
					]),
				],
			},
		],
	},
	// ===========================================================================
	// WEEK 2 (Days 5-8)
	// ===========================================================================
	{
		weekNumber: 2,
		days: [
			// Week 2, Day 5
			{
				dayNumber: 5,
				warmUp:
					'3 rounds SS: Empty Bar Squats x10 / Empty Bar Bench Press x20',
				exerciseGroups: [
					solo(
						ex('Back Squat', ...pct(5, [60, 65, 70, 70], 'Back Squat 1RM')),
						150,
					),
					solo(
						ex(
							'Bench Press',
							...pct(6, [62, 65, 67], 'Bench 1RM'),
							...pct(8, [60, 62, 65], 'Bench 1RM'),
							...pct(10, [60, 60, 60], 'Bench 1RM'),
						),
						180,
					),
					solo(
						ex(
							'Dips or Bench Dips',
							s(10, 'weighted if possible'),
							s(10, 'weighted if possible'),
							s(10, 'weighted if possible'),
							s(10, 'weighted if possible'),
						),
						150,
					),
					// cardio finisher
					ss([
						ex('DB Rear Laterals', ...r(20, 3)),
						ex('Close Grip Pushups', ...r(10, 3)),
					]),
				],
			},
			// Week 2, Day 6
			{
				dayNumber: 6,
				warmUp: 'Lots of Lat Stretches',
				exerciseGroups: [
					solo(
						ex(
							'Pull Up',
							s(4, 'weighted if possible, slow & strict'),
							s(4, 'weighted if possible, slow & strict'),
							s(4, 'weighted if possible, slow & strict'),
							s(4, 'weighted if possible, slow & strict'),
						),
						135,
					),
					solo(ex('DB Pullover', ...r(5, 4)), 135),
					ss(
						[
							ex('Bodyweight Inverted Rows', ...r(10, 3)),
							ex('Chest Supported 2-Arm DB Rows', ...r(10, 3)),
						],
						135,
					),
					// cardio finisher
					ss([
						ex('DB Hammer Curls', ...r(20, 3)),
						ex('DB Shrugs', ...r(20, 3)),
					]),
				],
			},
			// Week 2, Day 7
			{
				dayNumber: 7,
				warmUp: '3 rounds SS: Empty Bar RDLs x5 / Pushups x5',
				exerciseGroups: [
					ss(
						[
							ex('Deadlift', ...pct(3, [60, 65, 70, 70, 70], 'Deadlift 1RM')),
							ex('DB Shrugs', ...r(10, 5)),
						],
						165,
					),
					solo(
						ex('Bench Press', ...pct(5, [60, 65, 70, 75], 'Bench 1RM')),
						165,
					),
					ss(
						[
							ex('EZ Bar or Straight Bar Skullcrushers', ...r(10, 3)),
							ex('Dips or Bench Dips', ...r(10, 3)),
						],
						165,
					),
					// cardio finisher
					solo(ex('DB Triceps Kickbacks', ...r(15, 3))),
				],
			},
			// Week 2, Day 8
			{
				dayNumber: 8,
				warmUp:
					'3 rounds SS: Empty Bar Squats x10 / Empty Bar Bent Over Rows x10',
				exerciseGroups: [
					solo(
						ex('Front Squat', ...pct(5, [50, 52, 55], 'Back Squat 1RM')),
						165,
					),
					solo(
						ex('Barbell Bent Over Rows', s(10), s(5), s(5), s(5), s(10)),
						165,
					),
					solo(
						ex(
							'Chin Up',
							s(3, 'weighted'),
							s(3, 'weighted'),
							s(3, 'weighted'),
							s(3, 'weighted'),
						),
						165,
					),
					solo(
						ex(
							'Barbell Curls',
							s(5, 'heavy'),
							s(5, 'heavy'),
							s(5, 'heavy'),
							s(5, 'heavy'),
						),
						165,
					),
					// cardio finisher
					solo(ex('DB Concentration Curls', ...r(15, 3))),
				],
			},
		],
	},
	// ===========================================================================
	// WEEK 3 (Days 9-12)
	// ===========================================================================
	{
		weekNumber: 3,
		days: [
			// Week 3, Day 9
			{
				dayNumber: 9,
				warmUp:
					'3 rounds: Empty Bar Overhead Press x10 / Shoulder & Lat Stretches',
				exerciseGroups: [
					solo(
						ex(
							'Barbell Standing Overhead Press',
							...pct(5, [35, 37.5, 40, 40], 'Bench 1RM'),
						),
						135,
					),
					// "Big 44's"
					ss(
						[
							ex('DB Front Raises', ...r(11, 3)),
							ex('DB Laterals', ...r(11, 3)),
							ex('DB Rear Laterals', ...r(11, 3)),
							ex('DB Curl to Overhead Press', ...r(11, 3)),
						],
						135,
					),
					solo(
						ex('Cable or Band Pushdowns', s(10), s(10), s(10), s(25), s(25)),
						135,
					),
					// cardio finisher
					ss([
						ex('DB Shrugs', ...r(20, 3)),
						ex('DB Triceps Kickbacks', ...r(10, 3)),
					]),
				],
			},
			// Week 3, Day 10
			{
				dayNumber: 10,
				warmUp: '3 rounds: Empty Bar RDLs x10 / Lat Stretches',
				exerciseGroups: [
					ss(
						[
							ex('Sumo Deadlift', ...pct(5, [60, 65, 70], 'Deadlift 1RM')),
							ex('DB Pullover', ...r(5, 3)),
						],
						135,
					),
					ss(
						[
							ex('Chest Supported 2-Arm DB Rows', ...r(10, 3)),
							ex('DB RDLs', ...r(10, 3)),
						],
						135,
					),
					solo(
						ex(
							'Chin Up',
							s(3, 'weighted'),
							s(3, 'weighted'),
							s(3, 'weighted'),
						),
						135,
					),
					solo(
						ex(
							'Barbell 21s',
							s(21, '7 low / 7 high / 7 full'),
							s(21, '7 low / 7 high / 7 full'),
							s(21, '7 low / 7 high / 7 full'),
						),
						135,
					),
					// cardio finisher
					solo(ex('Barbell Shrugs', ...r(10, 4))),
				],
			},
			// Week 3, Day 11 — "Huge Day"
			{
				dayNumber: 11,
				warmUp:
					'Huge Day - Get Ready. 3 rounds SS: Empty Bar Squats x10 / Empty Bar Bench Press x20',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							se(3, '70% of Back Squat 1RM'),
							se(4, '70% of Back Squat 1RM'),
							se(5, '70% of Back Squat 1RM'),
							se(2, '80% of Back Squat 1RM'),
							se(3, '80% of Back Squat 1RM'),
							se(4, '80% of Back Squat 1RM'),
							se(1, '90% of Back Squat 1RM'),
							se(1, '90% of Back Squat 1RM'),
							se(1, '90% of Back Squat 1RM'),
						),
						165,
					),
					solo(
						ex(
							'Bench Press',
							se(4, '70% of Bench 1RM'),
							se(5, '70% of Bench 1RM'),
							se(6, '70% of Bench 1RM'),
							se(3, '80% of Bench 1RM'),
							se(4, '80% of Bench 1RM'),
							se(5, '80% of Bench 1RM'),
							se(1, '90% of Bench 1RM'),
							se(1, '90% of Bench 1RM'),
							se(1, '90% of Bench 1RM'),
						),
						165,
					),
					// cardio finisher
					ss([
						ex('DB Shrugs', ...r(10, 3)),
						ex('Dips or Bench Dips', ...r(10, 3)),
					]),
				],
			},
			// Week 3, Day 12
			{
				dayNumber: 12,
				warmUp: 'Lat Stretches - Take your time',
				exerciseGroups: [
					solo(ex('Barbell Bent Over Rows', ...r(10, 3)), 135),
					ss(
						[
							ex('DB Pullover', s(5), s(8), s(10), s(12)),
							ex('DB Rear Laterals', ...r(15, 4)),
						],
						135,
					),
					solo(
						ex(
							'Barbell Curls',
							s(5, 'heavy'),
							s(5, 'heavy'),
							s(5, 'heavy'),
							s(5, 'heavy'),
						),
						135,
					),
					solo(ex('DB Hammer Curls', ...r(20, 3)), 135),
					// cardio: day off
				],
			},
		],
	},
	// ===========================================================================
	// WEEK 4 (Days 13-16)
	// ===========================================================================
	{
		weekNumber: 4,
		days: [
			// Week 4, Day 13
			{
				dayNumber: 13,
				warmUp:
					'3 rounds SS: Empty Bar Squats & RDLs x5 / Empty Bar Bench Press x20',
				exerciseGroups: [
					solo(
						ex(
							'Deadlift',
							se(3, '60% of Deadlift 1RM'),
							se(3, '70% of Deadlift 1RM'),
							se(3, '75% of Deadlift 1RM'),
							se(2, '80% of Deadlift 1RM'),
							se(2, '85% of Deadlift 1RM'),
							se(1, '90% of Deadlift 1RM'),
							se(1, '92.5% of Deadlift 1RM'),
						),
						165,
					),
					solo(
						ex(
							'Bench Press',
							se(2, '60% of Bench 1RM'),
							se(2, '70% of Bench 1RM'),
							se(2, '80% of Bench 1RM'),
							se(2, '85% of Bench 1RM'),
							se(2, '90% of Bench 1RM'),
							se(5, '80% of Bench 1RM'),
						),
						165,
					),
					solo(
						ex(
							'EZ Bar or Straight Bar Skullcrushers',
							s(10),
							s(10),
							s(10),
							s(15),
							s(20),
						),
						165,
					),
					// cardio finisher
					solo(ex('DB Shrugs', ...r(20, 3))),
				],
			},
			// Week 4, Day 14
			{
				dayNumber: 14,
				warmUp: '3 rounds SS: Empty Bar Squats x10 / Lat Stretches',
				exerciseGroups: [
					ss(
						[
							ex('Back Squat', ...pct(5, [50, 55, 60], 'Back Squat 1RM')),
							ex('1-Arm DB Row', ...r(5, 3)),
						],
						135,
					),
					ss(
						[
							ex(
								'Pull Up',
								s(3, 'weighted'),
								s(3, 'weighted'),
								s(3, 'weighted'),
							),
							ex('DB RDLs', ...r(10, 3)),
						],
						135,
					),
					solo(ex('Reverse Grip Barbell Bent Over Rows', ...r(10, 3)), 135),
					solo(ex('Alt. DB Curls', s(5), s(5), s(10), s(10)), 135),
					// cardio finisher
					ss([
						ex('DB Rear Laterals', ...r(15, 2)),
						ex('DB Hammer Curls', ...r(20, 2)),
					]),
				],
			},
			// Week 4, Day 15
			{
				dayNumber: 15,
				warmUp: 'Shoulder & Lat Stretches',
				exerciseGroups: [
					solo(
						ex(
							'Barbell Standing Overhead Press',
							s(5, 'Start ~37.5% of Bench 1RM; hold this weight as reps climb'),
							s(6),
							s(7),
							s(8),
						),
						165,
					),
					solo(ex('DB Curl to Overhead Press', ...r(10, 3)), 165),
					solo(
						ex(
							'Close Grip Bench',
							s(5),
							s(5),
							s(5),
							s(8),
							s(8),
							s(8),
							s(10),
							s(10),
							s(10),
						),
						165,
					),
					// cardio finisher
					solo(ex('Cable or Band Overhead Triceps Extensions', ...r(20, 4))),
				],
			},
			// Week 4, Day 16
			{
				dayNumber: 16,
				warmUp: '3 rounds SS: Empty Bar RDLs x10 / Lat Stretches',
				exerciseGroups: [
					solo(
						ex(
							'Snatch Grip Deadlift',
							...pct(5, [50, 55, 60], 'Deadlift 1RM'),
							se(10, '50% of Deadlift 1RM'),
						),
						165,
					),
					ss(
						[
							ex(
								'Chin Up',
								s(3, 'weighted'),
								s(3, 'weighted'),
								s(3, 'weighted'),
								s(3, 'weighted'),
							),
							ex('DB Pullover', s(5), s(5), s(5), s(10)),
						],
						165,
					),
					solo(ex('1-Arm DB Row', s(5), s(5), s(10)), 165),
					solo(
						ex(
							'Barbell 21s',
							s(21, '7 low / 7 high / 7 full'),
							s(21, '7 low / 7 high / 7 full'),
							s(21, '7 low / 7 high / 7 full'),
						),
						165,
					),
					// cardio finisher
					solo(ex('DB Shrugs', ...r(20, 3))),
				],
			},
		],
	},
	// ===========================================================================
	// WEEK 5 (Days 17-20)
	// ===========================================================================
	{
		weekNumber: 5,
		days: [
			// Week 5, Day 17 — "Another Big Day"
			{
				dayNumber: 17,
				warmUp:
					'Another Big Day. 3 rounds SS: Empty Bar RDLs x10 / Empty Bar Bench Press x20',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							se(3, '60% of Back Squat 1RM'),
							se(3, '70% of Back Squat 1RM'),
							se(3, '75% of Back Squat 1RM'),
							se(3, '80% of Back Squat 1RM'),
							se(4, '60% of Back Squat 1RM'),
							se(4, '70% of Back Squat 1RM'),
							se(4, '75% of Back Squat 1RM'),
							se(4, '80% of Back Squat 1RM'),
						),
						165,
					),
					solo(
						ex(
							'Bench Press',
							se(4, '60% of Bench 1RM'),
							se(4, '70% of Bench 1RM'),
							se(4, '75% of Bench 1RM'),
							se(4, '80% of Bench 1RM'),
							se(5, '60% of Bench 1RM'),
							se(5, '70% of Bench 1RM'),
							se(5, '75% of Bench 1RM'),
							se(5, '80% of Bench 1RM'),
						),
						165,
					),
					solo(ex('DB RDLs', ...r(5, 3)), 165),
					// cardio finisher
					ss([
						ex('DB Shrugs', ...r(20, 3)),
						ex('EZ Bar or Straight Bar Skullcrushers', ...r(10, 3)),
					]),
				],
			},
			// Week 5, Day 18
			{
				dayNumber: 18,
				warmUp: '3 rounds SS: Empty Bar Bent Over Rows / Lat Stretches',
				exerciseGroups: [
					solo(
						ex(
							'Chin Up',
							s(3, 'weighted'),
							s(3, 'weighted'),
							s(3, 'weighted'),
							s(3, 'weighted'),
						),
						120,
					),
					ss(
						[
							ex('Chest Supported 2-Arm DB Rows', ...r(10, 3)),
							ex('DB Rear Laterals', ...r(20, 3)),
						],
						120,
					),
					solo(
						ex(
							'Pull Up',
							s(3, 'weighted'),
							s(3, 'weighted'),
							s(3, 'weighted'),
						),
						120,
					),
					solo(
						ex(
							'Barbell Curls',
							s(5, 'heavy'),
							s(5, 'heavy'),
							s(5, 'heavy'),
							s(5, 'heavy'),
							s(5, 'heavy'),
						),
						120,
					),
					// cardio finisher
					solo(ex('DB Shrugs', ...r(20, 4))),
				],
			},
			// Week 5, Day 19
			{
				dayNumber: 19,
				warmUp: '3 rounds: Empty Bar RDLs x10 / Empty Bar Bench Press x20',
				exerciseGroups: [
					solo(
						ex(
							'Deadlift',
							se(5, '60% of Deadlift 1RM'),
							se(4, '70% of Deadlift 1RM'),
							se(3, '75% of Deadlift 1RM'),
							se(2, '80% of Deadlift 1RM'),
							se(1, '90% of Deadlift 1RM'),
							se(5, '65% of Deadlift 1RM'),
							se(4, '75% of Deadlift 1RM'),
							se(3, '80% of Deadlift 1RM'),
							se(2, '85% of Deadlift 1RM'),
							se(1, '92.5% of Deadlift 1RM'),
						),
						165,
					),
					solo(
						ex('Bench Press', ...pct(10, [50, 55, 60], 'Bench 1RM')),
						165,
					),
					solo(ex('Dips or Bench Dips', ...r(10, 4)), 165),
					solo(ex('DB Shrugs', ...r(20, 4)), 165),
					// cardio finisher
					solo(
						ex(
							'DB Triceps Kickbacks',
							s(20, '20 each arm'),
							s(20, '20 each arm'),
							s(20, '20 each arm'),
						),
					),
				],
			},
			// Week 5, Day 20 — final day
			{
				dayNumber: 20,
				warmUp: '3 rounds: Empty Bar RDLs x10 / Lat Stretches',
				exerciseGroups: [
					solo(
						ex('Front Squat', ...pct(3, [50, 55, 60, 60], 'Back Squat 1RM')),
						135,
					),
					ss(
						[
							ex('DB Pullover', s(5), s(8), s(10), s(12)),
							ex('Barbell RDLs', ...r(5, 4)),
						],
						135,
					),
					solo(ex('1-Arm DB Row', s(5), s(5), s(10), s(15)), 135),
					solo(
						ex(
							'Barbell 21s',
							s(21, '7 low / 7 high / 7 full'),
							s(21, '7 low / 7 high / 7 full'),
							s(21, '7 low / 7 high / 7 full'),
						),
						135,
					),
					// cardio finisher
					solo(ex('DB Rear Laterals', s(10), s(20), s(30))),
				],
			},
		],
	},
];

// ===========================================================================
// PERIODIC TABLE OF THICKNESS PROGRAM
// ===========================================================================

const PTOT_NAME = 'Periodic Table of Thickness';
const PTOT_DESCRIPTION =
	'A 4-week, 4-day density-style hypertrophy & strength program. ' +
	'Each day pairs a percentage-based DENSITY protocol on the main lifts ' +
	'with an Extra Growth accessory superset and a high-rep CARDIO circuit finisher.';

// Warm-up text is the same for each day-slot every week.
const PTOT_WARMUP_D1 =
	'3 rounds: 10 Bodyweight Squats / 10 Empty Bar RDLs / 10 Empty Bar Bent Over Rows';
const PTOT_WARMUP_D2 =
	'3 rounds: 10 Bodyweight Squats / 10 Pushups / 10 Empty Bar RDLs';
const PTOT_WARMUP_D3 =
	'2 rounds: 10 Bodyweight Squats / 5 Lunges each leg / 10 Pushups / Empty Bar Bent Over Rows';
const PTOT_WARMUP_D4 =
	'2 rounds: 10 Empty Bar RDLs / 5 Pushups / 10 Empty Bar Bent Over Rows / 5 each leg Box Step Ups (bodyweight)';

const CHIN_NOTE = 'strict, slow';
const PULL_NOTE = 'neutral grip, strict, full ROM';
const TWENTYONE_NOTE = '7 low / 7 high / 7 full';

const ptotWeeks: WeekInput[] = [
	// ===========================================================================
	// WEEK 1
	// ===========================================================================
	{
		weekNumber: 1,
		days: [
			{
				dayNumber: 1,
				warmUp: PTOT_WARMUP_D1,
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							...pct(5, [50, 60], 'Back Squat 1RM'),
							...pct(5, [70, 70, 70, 70, 70], 'Back Squat 1RM'),
						),
						165,
					),
					solo(
						ex(
							'Bench Press',
							...pct(5, [55, 65], 'Bench 1RM'),
							...pct(5, [75, 75, 75, 75, 75], 'Bench 1RM'),
						),
						165,
					),
					solo(ex('Barbell Bent Over Rows', ...r(10, 5)), 165),
					// Extra Growth
					ss([
						ex('DB Pullover', ...r(8, 4)),
						ex('DB Laterals', ...r(20, 4)),
					]),
					// Cardio circuit (4x25)
					ss([
						ex('DB Hammer Curls', ...r(25, 4)),
						ex('Cable or Band Pushdowns', ...r(25, 4)),
						ex('DB Shrugs', ...r(25, 4)),
						ex('Band Pull Aparts', ...r(25, 4)),
					]),
				],
			},
			{
				dayNumber: 2,
				warmUp: PTOT_WARMUP_D2,
				exerciseGroups: [
					solo(
						ex(
							'Deadlift',
							...pct(5, [60], 'Deadlift 1RM'),
							...pct(5, [70, 70, 70, 70, 70], 'Deadlift 1RM'),
						),
						165,
					),
					solo(ex('Barbell Standing Overhead Press', ...r(5, 4)), 165),
					solo(
						ex(
							'Chin Up',
							...Array.from({ length: 5 }, () => s(3, CHIN_NOTE)),
						),
						165,
					),
					// Extra Growth
					ss([
						ex('Low Angle DB Incline', ...r(10, 3)),
						ex('Chest Supported 2-Arm DB Rows', ...r(20, 3)),
					]),
					// Cardio circuit (x4)
					ss([
						ex(
							'Barbell 21s',
							...Array.from({ length: 4 }, () => s(21, TWENTYONE_NOTE)),
						),
						ex('Close Grip Pushups', ...r(10, 4)),
						ex('Barbell Shrugs', ...r(10, 4)),
						ex('DB Rear Laterals', ...r(20, 4)),
					]),
				],
			},
			{
				dayNumber: 3,
				warmUp: PTOT_WARMUP_D3,
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							...pct(5, [60], 'Back Squat 1RM'),
							...pct(3, [70], 'Back Squat 1RM'),
							...pct(2, [80, 80, 80, 80], 'Back Squat 1RM'),
						),
						165,
					),
					solo(
						ex(
							'Bench Press',
							...pct(5, [60, 70], 'Bench 1RM'),
							...pct(2, [80, 80, 80, 80, 80], 'Bench 1RM'),
						),
						165,
					),
					solo(ex('Reverse Grip Barbell Bent Over Rows', ...r(10, 5)), 165),
					// Extra Growth
					ss([
						ex('Barbell Front Raises', ...r(10, 4)),
						ex('Barbell Reverse Curls', ...r(20, 4)),
					]),
					// Cardio circuit (4x20)
					ss([
						ex('EZ Bar or Straight Bar Skullcrushers', ...r(20, 4)),
						ex('DB Shrugs', ...r(20, 4)),
						ex('Band Pull Aparts', ...r(20, 4)),
					]),
				],
			},
			{
				dayNumber: 4,
				warmUp: PTOT_WARMUP_D4,
				exerciseGroups: [
					solo(
						ex(
							'Deadlift',
							...pct(5, [55, 65], 'Deadlift 1RM'),
							...pct(5, [75, 75, 75, 75, 75], 'Deadlift 1RM'),
						),
						165,
					),
					solo(ex('Barbell Standing Overhead Press', ...r(10, 4)), 165),
					solo(
						ex(
							'Neutral Grip Pull Up',
							...Array.from({ length: 4 }, () => s(3, PULL_NOTE)),
						),
						165,
					),
					// Extra Growth
					ss([
						ex('Close Grip Bench', ...r(8, 4)),
						ex('DB Pullover', ...r(5, 4)),
					]),
					// Cardio circuit (x4)
					ss([
						ex(
							'Barbell Curls',
							...Array.from({ length: 4 }, () => s(8, 'heavy')),
						),
						ex('Cable or Band Pushdowns', ...r(20, 4)),
						ex('Barbell Shrugs', ...r(20, 4)),
						ex('DB Rear Laterals', ...r(20, 4)),
					]),
				],
			},
		],
	},
	// ===========================================================================
	// WEEK 2
	// ===========================================================================
	{
		weekNumber: 2,
		days: [
			{
				dayNumber: 1,
				warmUp: PTOT_WARMUP_D1,
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							...pct(5, [60], 'Back Squat 1RM'),
							...pct(3, [70], 'Back Squat 1RM'),
							...pct(3, [80, 80, 80, 80], 'Back Squat 1RM'),
						),
						165,
					),
					solo(
						ex(
							'Bench Press',
							...pct(5, [55, 65, 72.5], 'Bench 1RM'),
							...pct(5, [77.5, 77.5, 77.5], 'Bench 1RM'),
						),
						165,
					),
					solo(ex('Barbell Bent Over Rows', ...r(5, 5)), 165),
					ss([
						ex('DB Pullover', ...r(5, 4)),
						ex('DB Laterals', ...r(20, 4)),
					]),
					ss([
						ex('DB Hammer Curls', ...r(25, 4)),
						ex('Cable or Band Pushdowns', ...r(25, 4)),
						ex('DB Shrugs', ...r(25, 4)),
						ex('Band Pull Aparts', ...r(25, 4)),
					]),
				],
			},
			{
				dayNumber: 2,
				warmUp: PTOT_WARMUP_D2,
				exerciseGroups: [
					solo(
						ex(
							'Deadlift',
							...pct(5, [55, 65], 'Deadlift 1RM'),
							...pct(4, [75, 75, 75, 75, 75], 'Deadlift 1RM'),
						),
						165,
					),
					solo(ex('Barbell Standing Overhead Press', ...r(5, 4)), 165),
					solo(
						ex(
							'Chin Up',
							...Array.from({ length: 4 }, () => s(4, CHIN_NOTE)),
						),
						165,
					),
					ss([
						ex('Low Angle DB Incline', ...r(8, 4)),
						ex(
							'Chest Supported 2-Arm DB Rows',
							...Array.from({ length: 4 }, () => s(5, 'heavy')),
						),
					]),
					ss([
						ex(
							'Barbell 21s',
							...Array.from({ length: 4 }, () => s(21, TWENTYONE_NOTE)),
						),
						ex('Close Grip Pushups', ...r(10, 4)),
						ex('Barbell Shrugs', ...r(10, 4)),
						ex('DB Rear Laterals', ...r(20, 4)),
					]),
				],
			},
			{
				dayNumber: 3,
				warmUp: PTOT_WARMUP_D3,
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							...pct(5, [50, 60], 'Back Squat 1RM'),
							...pct(5, [72.5, 72.5, 72.5, 72.5, 72.5], 'Back Squat 1RM'),
						),
						165,
					),
					solo(
						ex(
							'Bench Press',
							...pct(5, [60, 70], 'Bench 1RM'),
							...pct(3, [80, 80, 80, 80, 80], 'Bench 1RM'),
						),
						165,
					),
					solo(ex('Reverse Grip Barbell Bent Over Rows', ...r(5, 5)), 165),
					ss([
						ex('Barbell Front Raises', ...r(12, 4)),
						ex('Barbell Reverse Curls', ...r(22, 4)),
					]),
					ss([
						ex('EZ Bar or Straight Bar Skullcrushers', ...r(20, 4)),
						ex('DB Shrugs', ...r(20, 4)),
						ex('Band Pull Aparts', ...r(20, 4)),
					]),
				],
			},
			{
				dayNumber: 4,
				warmUp: PTOT_WARMUP_D4,
				exerciseGroups: [
					solo(
						ex(
							'Deadlift',
							...pct(4, [60, 70], 'Deadlift 1RM'),
							...pct(4, [80, 80, 80, 80], 'Deadlift 1RM'),
						),
						165,
					),
					solo(ex('Barbell Standing Overhead Press', ...r(11, 4)), 165),
					solo(
						ex(
							'Neutral Grip Pull Up',
							...Array.from({ length: 4 }, () => s(4, PULL_NOTE)),
						),
						165,
					),
					ss([
						ex('Close Grip Bench', ...r(10, 4)),
						ex('DB Pullover', ...r(10, 4)),
					]),
					ss([
						ex(
							'Barbell Curls',
							...Array.from({ length: 4 }, () => s(8, 'heavy')),
						),
						ex('Cable or Band Pushdowns', ...r(20, 4)),
						ex('Barbell Shrugs', ...r(20, 4)),
						ex('DB Rear Laterals', ...r(20, 4)),
					]),
				],
			},
		],
	},
	// ===========================================================================
	// WEEK 3
	// ===========================================================================
	{
		weekNumber: 3,
		days: [
			{
				dayNumber: 1,
				warmUp: PTOT_WARMUP_D1,
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							...pct(5, [55, 65], 'Back Squat 1RM'),
							...pct(5, [75, 75, 75], 'Back Squat 1RM'),
						),
						165,
					),
					solo(
						ex(
							'Bench Press',
							...pct(5, [55, 65], 'Bench 1RM'),
							...pct(5, [75, 75, 75, 75, 75], 'Bench 1RM'),
						),
						165,
					),
					solo(ex('Barbell Bent Over Rows', ...r(10, 5)), 165),
					ss([
						ex('DB Pullover', ...r(5, 4)),
						ex('DB Laterals', ...r(25, 4)),
					]),
					ss([
						ex('DB Hammer Curls', ...r(25, 4)),
						ex('Cable or Band Pushdowns', ...r(25, 4)),
						ex('DB Shrugs', ...r(25, 4)),
						ex('Band Pull Aparts', ...r(25, 4)),
					]),
				],
			},
			{
				dayNumber: 2,
				warmUp: PTOT_WARMUP_D2,
				exerciseGroups: [
					solo(
						ex(
							'Deadlift',
							...pct(5, [60, 70], 'Deadlift 1RM'),
							...pct(3, [80, 80, 80, 80, 80], 'Deadlift 1RM'),
						),
						165,
					),
					solo(ex('Barbell Standing Overhead Press', ...r(5, 4)), 165),
					solo(
						ex(
							'Chin Up',
							...Array.from({ length: 5 }, () => s(4, CHIN_NOTE)),
						),
						165,
					),
					ss([
						ex('Low Angle DB Incline', ...r(12, 3)),
						ex('Chest Supported 2-Arm DB Rows', ...r(25, 3)),
					]),
					ss([
						ex(
							'Barbell 21s',
							...Array.from({ length: 4 }, () => s(21, TWENTYONE_NOTE)),
						),
						ex('Close Grip Pushups', ...r(10, 4)),
						ex('Barbell Shrugs', ...r(10, 4)),
						ex('DB Rear Laterals', ...r(20, 4)),
					]),
				],
			},
			{
				dayNumber: 3,
				warmUp: PTOT_WARMUP_D3,
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							...pct(4, [60, 70], 'Back Squat 1RM'),
							...pct(4, [80, 80, 80, 80], 'Back Squat 1RM'),
						),
						165,
					),
					solo(
						ex(
							'Bench Press',
							...pct(4, [65, 75, 80], 'Bench 1RM'),
							...pct(2, [85, 85, 85, 85, 85], 'Bench 1RM'),
						),
						165,
					),
					solo(ex('Reverse Grip Barbell Bent Over Rows', ...r(10, 5)), 165),
					ss([
						ex('Barbell Front Raises', ...r(15, 4)),
						ex('Barbell Reverse Curls', ...r(25, 4)),
					]),
					ss([
						ex('EZ Bar or Straight Bar Skullcrushers', ...r(20, 4)),
						ex('DB Shrugs', ...r(20, 4)),
						ex('Band Pull Aparts', ...r(20, 4)),
					]),
				],
			},
			{
				dayNumber: 4,
				warmUp: PTOT_WARMUP_D4,
				exerciseGroups: [
					solo(
						ex(
							'Deadlift',
							...pct(5, [65, 75], 'Deadlift 1RM'),
							...pct(3, [80], 'Deadlift 1RM'),
							...pct(3, [85, 85, 85], 'Deadlift 1RM'),
						),
						165,
					),
					solo(ex('Barbell Standing Overhead Press', ...r(10, 4)), 165),
					solo(
						ex(
							'Neutral Grip Pull Up',
							...Array.from({ length: 4 }, () => s(4, PULL_NOTE)),
						),
						165,
					),
					ss([
						ex('Close Grip Bench', ...r(12, 4)),
						ex('DB Pullover', ...r(5, 4)),
					]),
					ss([
						ex(
							'Barbell Curls',
							...Array.from({ length: 4 }, () => s(8, 'heavy')),
						),
						ex('Cable or Band Pushdowns', ...r(20, 4)),
						ex('Barbell Shrugs', ...r(20, 4)),
						ex('DB Rear Laterals', ...r(20, 4)),
					]),
				],
			},
		],
	},
	// ===========================================================================
	// WEEK 4
	// ===========================================================================
	{
		weekNumber: 4,
		days: [
			{
				dayNumber: 1,
				warmUp: PTOT_WARMUP_D1,
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							...pct(3, [60, 70, 80], 'Back Squat 1RM'),
							...pct(3, [85, 85, 85], 'Back Squat 1RM'),
						),
						165,
					),
					solo(
						ex(
							'Bench Press',
							...pct(5, [55, 65], 'Bench 1RM'),
							...pct(6, [75, 75, 75, 75], 'Bench 1RM'),
						),
						165,
					),
					solo(ex('Barbell Bent Over Rows', ...r(5, 5)), 165),
					ss([
						ex('DB Pullover', ...r(10, 3)),
						ex('DB Laterals', ...r(20, 3)),
					]),
					ss([
						ex('DB Hammer Curls', ...r(25, 4)),
						ex('Cable or Band Pushdowns', ...r(25, 4)),
						ex('DB Shrugs', ...r(25, 4)),
						ex('Band Pull Aparts', ...r(25, 4)),
					]),
				],
			},
			{
				dayNumber: 2,
				warmUp: PTOT_WARMUP_D2,
				exerciseGroups: [
					solo(
						ex(
							'Deadlift',
							...pct(5, [60, 70], 'Deadlift 1RM'),
							...pct(4, [80, 80, 80, 80], 'Deadlift 1RM'),
						),
						165,
					),
					solo(ex('Barbell Standing Overhead Press', ...r(5, 4)), 165),
					solo(
						ex(
							'Chin Up',
							...Array.from({ length: 4 }, () => s(5, CHIN_NOTE)),
						),
						165,
					),
					ss([
						ex('Low Angle DB Incline', ...r(15, 3)),
						ex('Chest Supported 2-Arm DB Rows', ...r(30, 3)),
					]),
					ss([
						ex(
							'Barbell 21s',
							...Array.from({ length: 4 }, () => s(21, TWENTYONE_NOTE)),
						),
						ex('Close Grip Pushups', ...r(10, 4)),
						ex('Barbell Shrugs', ...r(10, 4)),
						ex('DB Rear Laterals', ...r(20, 4)),
					]),
				],
			},
			{
				dayNumber: 3,
				warmUp: PTOT_WARMUP_D3,
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							...pct(5, [55, 65], 'Back Squat 1RM'),
							...pct(5, [75, 75, 75, 75], 'Back Squat 1RM'),
						),
						165,
					),
					solo(
						ex(
							'Bench Press',
							...pct(5, [60, 70], 'Bench 1RM'),
							...pct(3, [80], 'Bench 1RM'),
							...pct(3, [85, 85, 85], 'Bench 1RM'),
						),
						165,
					),
					solo(ex('Reverse Grip Barbell Bent Over Rows', ...r(5, 5)), 165),
					ss([
						ex('Barbell Front Raises', ...r(20, 3)),
						ex('Barbell Reverse Curls', ...r(30, 3)),
					]),
					ss([
						ex('EZ Bar or Straight Bar Skullcrushers', ...r(20, 4)),
						ex('DB Shrugs', ...r(20, 4)),
						ex('Band Pull Aparts', ...r(20, 4)),
					]),
				],
			},
			{
				dayNumber: 4,
				warmUp: PTOT_WARMUP_D4,
				exerciseGroups: [
					solo(
						ex(
							'Deadlift',
							...pct(3, [60, 70, 80], 'Deadlift 1RM'),
							...pct(2, [90, 90, 90], 'Deadlift 1RM'),
						),
						165,
					),
					solo(ex('Barbell Standing Overhead Press', ...r(10, 3)), 165),
					solo(
						ex(
							'Neutral Grip Pull Up',
							...Array.from({ length: 4 }, () => s(5, PULL_NOTE)),
						),
						165,
					),
					ss([
						ex('Close Grip Bench', ...r(15, 4)),
						ex('DB Pullover', ...r(5, 4)),
					]),
					ss([
						ex(
							'Barbell Curls',
							...Array.from({ length: 4 }, () => s(8, 'heavy')),
						),
						ex('Cable or Band Pushdowns', ...r(20, 4)),
						ex('Barbell Shrugs', ...r(20, 4)),
						ex('DB Rear Laterals', ...r(20, 4)),
					]),
				],
			},
		],
	},
];

// ===========================================================================
// FILLING OUT THAT HOODIE PROGRAM
// ===========================================================================

const FOTH_NAME = 'Filling Out That Hoodie';
const FOTH_DESCRIPTION =
	'A 4-week, 4-day upper-body hypertrophy program. ' +
	'Each day runs a "Torso Thickening" block (percentage pressing and pulling) into a ' +
	'"Make the Sleeves Fit Tight" arm block, finished with a high-rep cardio circuit. ' +
	'Rest periods are prescribed per lift.';

// Snatch-grip deadlift percentage is written as a range off the deadlift max.
const FOTH_DL_RANGE = '50-60% of Deadlift 1RM';

const fothWeeks: WeekInput[] = [
	// ===========================================================================
	// WEEK 1
	// ===========================================================================
	{
		weekNumber: 1,
		days: [
			// Week 1, Day 1 (Monday)
			{
				dayNumber: 1,
				warmUp:
					'2-3 rounds SS: Empty Bar Bench Press x20 / Arm Swings / Lat Stretches',
				exerciseGroups: [
					ss(
						[
							ex('Bench Press', ...pct(8, [60, 70, 75, 72, 70], 'Bench 1RM')),
							ex('Cable or Band Face Pulls', ...r(10, 5)),
						],
						180,
					),
					solo(ex('DB Arnold Press', ...r(10, 4)), 180),
					solo(
						ex('EZ Bar or Straight Bar Skullcrushers', s(10), s(10), s(10), s(25)),
						120,
					),
					solo(ex('Cable or Band Pushdowns', ...r(25, 4)), 120),
					// cardio
					ss([
						ex('Band Pull Aparts', ...r(25, 4)),
						ex('DB Shrugs', ...r(25, 4)),
					]),
				],
			},
			// Week 1, Day 2 (Tuesday)
			{
				dayNumber: 2,
				warmUp: '3 rounds SS: Empty Bar Bent Over Row x10 / Lat Stretches',
				exerciseGroups: [
					ss(
						[
							ex('Chin Up', ...Array.from({ length: 4 }, () => s(3, 'weighted'))),
							ex('DB Pullover', ...r(8, 4)),
						],
						120,
					),
					solo(ex('1-Arm DB Row', ...r(8, 4)), 120),
					solo(ex('Barbell Curls', s(10), s(10), s(10), s(10), s(25)), 90),
					solo(
						ex(
							'DB Concentration Curls',
							...Array.from({ length: 4 }, () => s(10, '10 each arm')),
						),
						90,
					),
					// cardio
					solo(
						ex(
							'DB Rear Laterals',
							...Array.from({ length: 4 }, () => s(20, 'light & strict')),
						),
					),
				],
			},
			// Week 1, Day 3 (Thursday)
			{
				dayNumber: 3,
				warmUp:
					'3-4 rounds SS: DB or KB Goblet Squat x5 / Empty Bar Overhead Press x5',
				exerciseGroups: [
					ss(
						[
							ex('Back Squat', ...pct(5, [60, 65, 70], 'Back Squat 1RM')),
							ex('Cable or Band Face Pulls', ...r(20, 3)),
						],
						180,
					),
					solo(
						ex(
							'Bench Press',
							...pct(5, [60, 70], 'Bench 1RM'),
							...pct(3, [80, 80, 80, 80, 80], 'Bench 1RM'),
						),
						180,
					),
					solo(ex('Barbell Upright Rows', ...r(15, 4)), 120),
					ss(
						[
							ex('Cable or Band Overhead Triceps Extensions', ...r(25, 4)),
							ex('Close Grip Bench', ...r(10, 4)),
						],
						120,
					),
					// cardio
					solo(ex('Barbell Shrugs', ...r(10, 5))),
				],
			},
			// Week 1, Day 4 (Friday)
			{
				dayNumber: 4,
				warmUp: '3 rounds SS: Band or Cable Face Pulls x10 / Lat Stretches',
				exerciseGroups: [
					ss(
						[
							ex('Pull Up', ...Array.from({ length: 4 }, () => s(3, 'weighted'))),
							ex('Chest Supported 2-Arm DB Rows', ...r(10, 4)),
						],
						180,
					),
					solo(
						ex('Snatch Grip Deadlift', ...pct(10, [45, 45, 45], 'Deadlift 1RM')),
						180,
					),
					solo(
						ex('Alt. DB Curls', ...Array.from({ length: 5 }, () => s(5, 'heavy'))),
						90,
					),
					solo(
						ex(
							'Barbell 21s',
							...Array.from({ length: 3 }, () => s(21, TWENTYONE_NOTE)),
						),
						90,
					),
					// cardio
					solo(ex('Barbell Reverse Curls', ...r(25, 4))),
				],
			},
		],
	},
	// ===========================================================================
	// WEEK 2
	// ===========================================================================
	{
		weekNumber: 2,
		days: [
			// Week 2, Day 1 (Monday)
			{
				dayNumber: 1,
				warmUp: '2-3 rounds SS: Empty Bar Bench Press x20 / Lat Stretches',
				exerciseGroups: [
					ss(
						[
							ex('Bench Press', ...pct(9, [60, 70, 73, 70, 65], 'Bench 1RM')),
							ex(
								'Cable or Band Face Pulls',
								s(10),
								s(10),
								s(10),
								s(10),
								s(25),
							),
						],
						180,
					),
					solo(
						ex(
							'Barbell Standing Overhead Press',
							...Array.from({ length: 3 }, () => s(10, 'feet flat, no legs')),
						),
						180,
					),
					solo(
						ex(
							'Dips or Bench Dips',
							...Array.from({ length: 4 }, () => s(10, 'add weight if able')),
						),
						120,
					),
					solo(
						ex(
							'DB Skullcrushers',
							s(5, 'one DB held with two hands'),
							s(5),
							s(5),
							s(5),
							s(25),
						),
						120,
					),
					// cardio
					ss([
						ex('Band Pull Aparts', ...r(25, 4)),
						ex('DB Shrugs', ...r(25, 4)),
					]),
				],
			},
			// Week 2, Day 2 (Tuesday)
			{
				dayNumber: 2,
				warmUp:
					'3 rounds SS: KB or DB Goblet Squats x5 / Empty Bar Overhead Press x10',
				exerciseGroups: [
					ss(
						[
							ex('Back Squat', ...pct(5, [65, 70, 75], 'Back Squat 1RM')),
							ex('DB Upright Rows', ...r(15, 3)),
						],
						150,
					),
					solo(
						ex('Barbell Bent Over Rows', s(5), s(5), s(5), s(10), s(10), s(20)),
						150,
					),
					solo(ex('Barbell Curls', ...r(10, 5)), 90),
					solo(ex('DB Hammer Curls', ...r(25, 4)), 90),
					// cardio
					solo(ex('Barbell Reverse Curls', ...r(25, 3))),
				],
			},
			// Week 2, Day 3 (Thursday)
			{
				dayNumber: 3,
				warmUp:
					'3-4 rounds SS: Empty Bar Bench Press x20 / Empty Bar Bent Over Rows x20',
				exerciseGroups: [
					ss(
						[
							ex(
								'Bench Press',
								...pct(6, [60, 70], 'Bench 1RM'),
								...pct(4, [80, 80, 80, 80, 80], 'Bench 1RM'),
							),
							ex('Cable or Band Face Pulls', ...r(10, 7)),
						],
						180,
					),
					solo(ex('DB Arnold Press', ...r(8, 4)), 180),
					solo(ex('EZ Bar or Straight Bar Skullcrushers', ...r(10, 4)), 120),
					solo(
						ex(
							'DB Triceps Kickbacks',
							...Array.from({ length: 4 }, () => s(15, '15 each arm')),
						),
						120,
					),
					// cardio
					solo(
						ex(
							'DB Rear Laterals',
							...Array.from({ length: 4 }, () => s(20, 'light & strict')),
						),
					),
				],
			},
			// Week 2, Day 4 (Friday)
			{
				dayNumber: 4,
				warmUp: '3 rounds SS: Super Light 1-Arm DB Rows x5 / Lat Stretches',
				exerciseGroups: [
					ss(
						[
							ex('Chin Up', ...Array.from({ length: 4 }, () => s(3, 'weighted'))),
							ex(
								'Snatch Grip Deadlift',
								...Array.from({ length: 4 }, () => se(5, FOTH_DL_RANGE)),
							),
						],
						180,
					),
					solo(
						ex('DB Pullover', s(5), s(5), s(5), s(10), s(10), s(10)),
						180,
					),
					solo(
						ex('Alt. DB Curls', ...Array.from({ length: 4 }, () => s(5, 'heavy'))),
						120,
					),
					solo(ex('Barbell Curls', ...r(5, 3)), 120),
					// cardio
					solo(ex('Barbell Reverse Curls', ...r(20, 4))),
				],
			},
		],
	},
	// ===========================================================================
	// WEEK 3
	// ===========================================================================
	{
		weekNumber: 3,
		days: [
			// Week 3, Day 1 (Monday)
			{
				dayNumber: 1,
				warmUp:
					'3 rounds SS: DB or KB Goblet Squats x5 / Empty Bar Overhead Press x10',
				exerciseGroups: [
					ss(
						[
							ex('Back Squat', ...pct(4, [60, 65, 70, 75], 'Back Squat 1RM')),
							ex('Cable or Band Face Pulls', ...r(10, 4)),
						],
						195,
					),
					solo(
						ex('Bench Press', ...pct(10, [60, 65, 70, 65, 60], 'Bench 1RM')),
						195,
					),
					solo(ex('DB Laterals', s(10), s(10), s(20), s(20)), 120),
					ss(
						[
							ex('Dips or Bench Dips', ...r(10, 4)),
							ex(
								'EZ Bar or Straight Bar Skullcrushers',
								s(10),
								s(10),
								s(10),
								s(20),
							),
						],
						120,
					),
					// cardio
					solo(ex('Cable or Band Pushdowns', ...r(25, 5))),
				],
			},
			// Week 3, Day 2 (Tuesday)
			{
				dayNumber: 2,
				warmUp: '3 rounds SS: Empty Bar Bent Over Row x10 / Lat Stretches',
				exerciseGroups: [
					ss(
						[
							ex('Pull Up', ...Array.from({ length: 4 }, () => s(3, 'weighted'))),
							ex('DB Rear Laterals', ...r(10, 4)),
						],
						150,
					),
					solo(
						ex('Reverse Grip Barbell Bent Over Rows', s(10), s(10), s(10), s(20)),
						150,
					),
					solo(
						ex(
							'Barbell 21s',
							...Array.from({ length: 3 }, () => s(21, TWENTYONE_NOTE)),
						),
						120,
					),
					ss(
						[
							ex('Alt. DB Curls', ...r(10, 3)),
							ex('DB Concentration Curls', ...r(10, 3)),
						],
						120,
					),
					// cardio (new exercise)
					solo(ex('Reverse Grip DB Curls', ...r(20, 4))),
				],
			},
			// Week 3, Day 3 (Thursday)
			{
				dayNumber: 3,
				warmUp:
					'3 rounds SS: Empty Bar Bench Press x20 / Empty Bar Bent Over Rows x10',
				exerciseGroups: [
					ss(
						[
							ex(
								'Bench Press',
								...pct(5, [65, 75], 'Bench 1RM'),
								...pct(3, [85, 85, 85], 'Bench 1RM'),
							),
							ex('Cable or Band Face Pulls', ...r(10, 5)),
						],
						180,
					),
					solo(
						ex(
							'Barbell Standing Overhead Press',
							...Array.from({ length: 5 }, () => s(5, 'strict, no legs')),
						),
						180,
					),
					// mechanical dropset: skullcrusher straight into close-grip press, 5 rounds
					ss(
						[
							ex(
								'EZ Bar or Straight Bar Skullcrushers',
								...Array.from({ length: 5 }, () =>
									s(10, 'mechanical dropset: 5 rounds, never release the bar, straight into close grip press'),
								),
							),
							ex('Close Grip Bench', ...r(15, 5)),
						],
						150,
					),
					// cardio
					solo(ex('DB Shrugs', ...r(10, 4))),
				],
			},
			// Week 3, Day 4 (Friday)
			{
				dayNumber: 4,
				warmUp:
					'3 rounds SS: KB or DB Goblet Squats x5 / Empty Bar Overhead Press x10',
				exerciseGroups: [
					ss(
						[
							ex('Back Squat', ...pct(4, [65, 70, 75, 80], 'Back Squat 1RM')),
							ex('DB Pullover', ...r(5, 4)),
						],
						180,
					),
					solo(
						ex(
							'Chest Supported 2-Arm DB Rows',
							s(10),
							s(10),
							s(10),
							s(10),
							s(25),
						),
						180,
					),
					solo(ex('Barbell Reverse Curls', ...r(10, 4)), 120),
					solo(ex('DB Concentration Curls', ...r(10, 4)), 120),
					// cardio
					solo(ex('Band Pull Aparts', ...r(25, 4))),
				],
			},
		],
	},
	// ===========================================================================
	// WEEK 4
	// ===========================================================================
	{
		weekNumber: 4,
		days: [
			// Week 4, Day 1 (Monday)
			{
				dayNumber: 1,
				warmUp: '3 rounds SS: Empty Bar Bench Press x20 / Lat Stretches',
				exerciseGroups: [
					ss(
						[
							ex('Bench Press', ...pct(11, [60, 65, 70, 65, 60], 'Bench 1RM')),
							ex('Cable or Band Face Pulls', ...r(10, 5)),
						],
						210,
					),
					solo(ex('DB Arnold Press', ...r(8, 4)), 150),
					solo(ex('Cable or Band Overhead Triceps Extensions', ...r(20, 4)), 90),
					solo(ex('DB Triceps Kickbacks', ...r(10, 4)), 90),
					// cardio
					solo(ex('Barbell Shrugs', ...r(10, 5))),
				],
			},
			// Week 4, Day 2 (Tuesday)
			{
				dayNumber: 2,
				warmUp:
					"3 rounds SS: Empty Bar RDLs x5 / Empty Bar Bent Over Rows x10",
				exerciseGroups: [
					ss(
						[
							ex(
								'Snatch Grip Deadlift',
								...Array.from({ length: 4 }, () => se(5, FOTH_DL_RANGE)),
							),
							ex('DB Rear Laterals', ...r(10, 4)),
						],
						150,
					),
					solo(ex('1-Arm DB Row', ...r(5, 4)), 150),
					solo(ex('DB Hammer Curls', ...r(20, 4)), 120),
					solo(
						ex(
							'Barbell 21s',
							...Array.from({ length: 3 }, () => s(21, TWENTYONE_NOTE)),
						),
						120,
					),
					// cardio
					solo(ex('Barbell Reverse Curls', ...r(20, 4))),
				],
			},
			// Week 4, Day 3 (Thursday)
			{
				dayNumber: 3,
				warmUp:
					'3 rounds SS: KB or DB Goblet Squats x5 / Empty Bar Overhead Press x10',
				exerciseGroups: [
					ss(
						[
							ex('Back Squat', ...pct(5, [60, 65, 70], 'Back Squat 1RM')),
							ex('Cable or Band Face Pulls', ...r(10, 3)),
						],
						180,
					),
					solo(
						ex(
							'Bench Press',
							...pct(5, [65, 75], 'Bench 1RM'),
							...pct(3, [80, 85], 'Bench 1RM'),
							...pct(2, [90, 90], 'Bench 1RM'),
						),
						180,
					),
					ss(
						[
							ex('DB Upright Rows', ...r(15, 3)),
							ex('Dips or Bench Dips', ...r(10, 3)),
						],
						120,
					),
					solo(ex('Cable or Band Pushdowns', ...r(25, 5)), 120),
					// cardio
					solo(ex('Band Pull Aparts', ...r(25, 5))),
				],
			},
			// Week 4, Day 4 (Friday)
			{
				dayNumber: 4,
				warmUp: '3 rounds SS: Light 1-Arm DB Rows x5 / Lat Stretches',
				exerciseGroups: [
					ss(
						[
							ex('Chin Up', ...Array.from({ length: 4 }, () => s(3, 'weighted'))),
							ex('DB Pullover', ...r(10, 4)),
						],
						150,
					),
					solo(ex('Barbell Bent Over Rows', ...r(10, 4)), 150),
					solo(
						ex('Alt. DB Curls', ...Array.from({ length: 5 }, () => s(5, 'heavy'))),
						150,
					),
					solo(ex('Barbell Reverse Curls', ...r(20, 4)), 150),
					// cardio
					solo(ex('Barbell Shrugs', ...r(20, 4))),
				],
			},
		],
	},
];

// ===========================================================================
// SQUATOBER THE PREQUEL PROGRAM
// ===========================================================================

const SQUATOBER_NAME = 'Squatober The Prequel';
const SQUATOBER_DESCRIPTION =
	'A 4-week squat-focused strength program. ' +
	'Daily Back Squat percentage work (undulating 50-90% of max) paired with ' +
	'upper-body accessories and a cardio finisher. Weeks run 3/4/4/3 days.';

const squatoberWeeks: WeekInput[] = [
	// ===========================================================================
	// WEEK 1 (3 days)
	// ===========================================================================
	{
		weekNumber: 1,
		days: [
			{
				dayNumber: 1,
				warmUp: 'Light KB Goblet Squats 2x10 / Arm Swings & Lat Stretches',
				exerciseGroups: [
					solo(
						ex('Back Squat', ...pct(3, [65, 65, 65, 65, 65], 'Back Squat 1RM')),
						165,
					),
					solo(ex('1-Arm DB Row', ...r(5, 4)), 165),
					solo(ex('Barbell Standing Overhead Press', ...r(8, 4)), 165),
					solo(
						ex('Barbell Curls', ...Array.from({ length: 4 }, () => s(5, 'heavy'))),
						165,
					),
					// cardio
					solo(ex('DB RDLs', ...r(10, 3))),
				],
			},
			{
				dayNumber: 2,
				warmUp:
					'Empty Bar RDLs 3x5 / Empty Bar Overhead Press 3x10 / Arm Swings & Lat Stretches',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							se(3, '75% of Back Squat 1RM', 'work up to 75% of max'),
							...pct(3, [75, 75, 75, 75, 75], 'Back Squat 1RM'),
						),
						165,
					),
					solo(
						ex('Bench Press', ...pct(5, [75, 75, 75, 75, 75], 'Bench 1RM')),
						165,
					),
					solo(
						ex('Chin Up', ...Array.from({ length: 4 }, () => s(3, 'weighted'))),
						165,
					),
					// cardio
					solo(ex('Weighted Pushups', ...r(10, 4))),
				],
			},
			{
				dayNumber: 3,
				warmUp:
					'Light KB Squats 2x10 / Empty Bar RDLs 3x5 / Arm Swings & Lat Stretches',
				exerciseGroups: [
					solo(
						ex('Back Squat', ...pct(10, [50, 50, 50], 'Back Squat 1RM')),
						180,
					),
					solo(ex('Barbell Bent Over Rows', ...r(10, 4)), 180),
					solo(ex('DB Incline Press', ...r(5, 4)), 180),
					solo(
						ex('Alt. DB Curls', ...Array.from({ length: 4 }, () => s(5, 'heavy'))),
						180,
					),
					// cardio
					ss([
						ex('DB Rear Laterals', ...r(10, 3)),
						ex('DB Shrugs', ...r(20, 3)),
					]),
				],
			},
		],
	},
	// ===========================================================================
	// WEEK 2 (4 days)
	// ===========================================================================
	{
		weekNumber: 2,
		days: [
			{
				dayNumber: 1,
				warmUp: 'Empty Bar RDLs 3x5 / Empty Bar Overhead Press 3x10',
				exerciseGroups: [
					solo(
						ex('Back Squat', ...pct(5, [70, 70, 70, 70, 70], 'Back Squat 1RM')),
						180,
					),
					solo(ex('1-Arm DB Row', ...r(8, 4)), 180),
					solo(
						ex('Bench Press', ...pct(3, [80, 80, 80, 80, 80, 80], 'Bench 1RM')),
						180,
					),
					solo(ex('Dips or Bench Dips', ...r(10, 4)), 180),
					// cardio
					solo(ex('DB Shrugs', ...r(20, 3))),
				],
			},
			{
				dayNumber: 2,
				warmUp: 'Light KB Goblet Squats 3x10 / Arm Swings & Lat Stretches',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							se(3, '80% of Back Squat 1RM', 'work up to 80% of max'),
							...pct(3, [80, 80, 80], 'Back Squat 1RM'),
						),
						180,
					),
					solo(
						ex('Chin Up', ...Array.from({ length: 4 }, () => s(3, 'weighted'))),
						180,
					),
					solo(ex('Barbell Standing Overhead Press', ...r(5, 4)), 180),
					solo(
						ex('Barbell Curls', ...Array.from({ length: 3 }, () => s(5, 'heavy'))),
						180,
					),
					// cardio
					solo(ex('DB Rear Laterals', ...r(20, 4))),
				],
			},
			{
				dayNumber: 3,
				warmUp: 'Empty Bar RDLs 3x5 / Empty Bar Bent Over Rows 3x10',
				exerciseGroups: [
					solo(
						ex('Back Squat', ...pct(10, [50, 50, 50, 50], 'Back Squat 1RM')),
						180,
					),
					solo(ex('DB Incline Press', ...r(10, 3)), 180),
					solo(ex('Barbell Bent Over Rows', ...r(10, 3)), 180),
					solo(ex('Dips or Bench Dips', ...r(10, 3)), 180),
					// cardio
					solo(ex('Barbell Shrugs', ...r(20, 3))),
				],
			},
			{
				dayNumber: 4,
				warmUp: 'Light KB Goblet Squats 3x10 / Arm Swings & Lat Stretches',
				exerciseGroups: [
					solo(
						ex('Back Squat', ...pct(5, [60, 60, 60], 'Back Squat 1RM')),
						180,
					),
					solo(
						ex('Bench Press', ...pct(10, [62.5, 62.5, 62.5, 62.5], 'Bench 1RM')),
						180,
					),
					solo(ex('1-Arm DB Row', ...r(5, 3)), 180),
					solo(
						ex(
							'Barbell 21s',
							...Array.from({ length: 3 }, () => s(21, TWENTYONE_NOTE)),
						),
						180,
					),
					// cardio
					solo(ex('DB Rear Laterals', ...r(20, 4))),
				],
			},
		],
	},
	// ===========================================================================
	// WEEK 3 (4 days)
	// ===========================================================================
	{
		weekNumber: 3,
		days: [
			{
				dayNumber: 1,
				warmUp: 'Empty Bar RDLs 3x5 / Empty Bar Overhead Press 3x10',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							se(3, '85% of Back Squat 1RM', 'work up to 85% of max'),
							...pct(3, [85, 85], 'Back Squat 1RM'),
						),
						165,
					),
					solo(ex('Barbell Standing Overhead Press', ...r(5, 4)), 165),
					solo(
						ex('Chin Up', ...Array.from({ length: 4 }, () => s(3, 'weighted'))),
						165,
					),
					solo(ex('Close Grip Pushups', ...r(10, 3)), 165),
					// cardio
					solo(ex('DB Shrugs', ...r(20, 4))),
				],
			},
			{
				dayNumber: 2,
				warmUp: 'Light KB Goblet Squats 3x10 / Arm Swings & Lat Stretches',
				exerciseGroups: [
					solo(
						ex('Back Squat', ...pct(10, [52.5, 52.5, 52.5], 'Back Squat 1RM')),
						180,
					),
					solo(ex('1-Arm DB Row', ...r(5, 4)), 180),
					solo(ex('DB Incline Press', ...r(5, 4)), 180),
					solo(
						ex('Alt. DB Curls', ...Array.from({ length: 4 }, () => s(5, 'heavy'))),
						180,
					),
					// cardio
					solo(ex('DB Upright Rows', ...r(10, 4))),
				],
			},
			{
				dayNumber: 3,
				warmUp: 'Empty Bar RDLs 3x5 / Empty Bar Bent Over Rows 3x10',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							se(4, '75% of Back Squat 1RM', 'work up to 75% of max'),
							...pct(4, [75, 75, 75, 75], 'Back Squat 1RM'),
						),
						180,
					),
					solo(ex('Barbell Bent Over Rows', ...r(10, 3)), 180),
					solo(
						ex('Bench Press', ...pct(3, [80, 80, 80, 80, 80], 'Bench 1RM')),
						180,
					),
					// cardio
					solo(
						ex('EZ Bar or Straight Bar Skullcrushers', s(10), s(10), s(15), s(20)),
					),
				],
			},
			{
				dayNumber: 4,
				warmUp: 'Light KB Goblet Squats 3x10 / Arm Swings & Lat Stretches',
				exerciseGroups: [
					solo(
						ex('Back Squat', ...pct(5, [65, 65, 65, 65], 'Back Squat 1RM')),
						165,
					),
					solo(
						ex('Chin Up', ...Array.from({ length: 4 }, () => s(3, 'weighted'))),
						165,
					),
					solo(ex('Barbell Standing Overhead Press', ...r(10, 3)), 165),
					solo(ex('DB Hammer Curls', ...r(10, 3)), 165),
					// cardio
					solo(ex('DB Rear Laterals', ...r(20, 3))),
				],
			},
		],
	},
	// ===========================================================================
	// WEEK 4 (3 days)
	// ===========================================================================
	{
		weekNumber: 4,
		days: [
			{
				dayNumber: 1,
				warmUp: 'Empty Bar RDLs 3x5 / Empty Bar Overhead Press 3x10',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							se(1, '90% of Back Squat 1RM', 'work up to 90% of max'),
							se(1, '90% of Back Squat 1RM'),
							se(2, '90% of Back Squat 1RM'),
							se(2, '90% of Back Squat 1RM'),
						),
						165,
					),
					solo(ex('DB Incline Press', ...r(10, 4)), 165),
					solo(ex('1-Arm DB Row', ...r(5, 4)), 165),
					// cardio
					solo(ex('Cable or Band Pushdowns', ...r(25, 4))),
				],
			},
			{
				dayNumber: 2,
				warmUp: 'Light KB Goblet Squats 3x10 / Arm Swings & Lat Stretches',
				exerciseGroups: [
					solo(
						ex('Back Squat', ...pct(5, [60, 60, 60], 'Back Squat 1RM')),
						180,
					),
					solo(
						ex(
							'Bench Press',
							...pct(10, [62.5, 62.5, 62.5, 62.5, 62.5], 'Bench 1RM'),
						),
						180,
					),
					solo(ex('Barbell Bent Over Rows', ...r(10, 4)), 180),
					// cardio
					ss([
						ex('DB Hammer Curls', ...r(20, 4)),
						ex('Barbell Shrugs', ...r(20, 4)),
					]),
				],
			},
			{
				dayNumber: 3,
				warmUp: 'Empty Bar RDLs 3x5 / Empty Bar Bent Over Rows 3x10',
				exerciseGroups: [
					solo(
						ex(
							'Back Squat',
							se(4, '75% of Back Squat 1RM', 'work up to 75% of max'),
							...pct(4, [75, 75, 75], 'Back Squat 1RM'),
						),
						165,
					),
					solo(
						ex('Chin Up', ...Array.from({ length: 4 }, () => s(3, 'weighted'))),
						165,
					),
					solo(ex('Barbell Standing Overhead Press', ...r(5, 4)), 165),
					// cardio
					solo(ex('Close Grip Pushups', ...r(10, 5))),
				],
			},
		],
	},
];

// ---------------------------------------------------------------------------
// Seed function (reusable for multiple programs)
// ---------------------------------------------------------------------------

/** Trim and collapse whitespace to prevent accidental duplicates */
function canonicalizeName(name: string): string {
	return name.trim().replace(/\s+/g, ' ');
}

/** Collect all unique exercise names from program week data */
function collectExerciseNames(
	...programs: WeekInput[][]
): Set<string> {
	const names = new Set<string>();
	for (const weeks of programs) {
		for (const week of weeks) {
			for (const day of week.days) {
				for (const group of day.exerciseGroups) {
					for (const exercise of group.exercises) {
						names.add(canonicalizeName(exercise.name));
					}
				}
			}
		}
	}
	return names;
}

/** Seed a single program (skip if already exists to preserve user data) */
async function seedProgram(
	name: string,
	description: string,
	weeks: WeekInput[],
): Promise<void> {
	// Skip if program already exists to preserve UserProgram/WorkoutSession/CompletedSet
	const existing = await prisma.program.findFirst({
		where: { name },
	});
	if (existing) {
		console.log(`  Program "${name}" already exists — skipping`);
		return;
	}

	// Create the full program hierarchy in one nested create
	const program = await prisma.program.create({
		data: {
			name,
			description,
			weeks: {
				create: weeks.map((week) => ({
					weekNumber: week.weekNumber,
					days: {
						create: week.days.map((day) => ({
							dayNumber: day.dayNumber,
							name: `Week ${week.weekNumber} Day ${day.dayNumber}`,
							warmUp: day.warmUp,
							exerciseGroups: {
								create: day.exerciseGroups.map(
									(group, groupIdx) => ({
										order: groupIdx + 1,
										type: group.type,
										restSeconds:
											group.restSeconds,
										exercises: {
											create: group.exercises.map(
												(
													exercise,
													exIdx,
												) => ({
													exercise: {
														connect:
															{
																name: canonicalizeName(exercise.name),
															},
													},
													order:
														exIdx +
														1,
													sets: {
														create: exercise.sets.map(
															(
																set,
																setIdx,
															) => ({
																setNumber:
																	setIdx +
																	1,
																reps: set.reps,
																notes: set.notes,
																effortTarget:
																	set.effortTarget,
															}),
														),
													},
												}),
											),
										},
									}),
								),
							},
						})),
					},
				})),
			},
		},
		include: {
			weeks: {
				include: {
					days: {
						include: {
							exerciseGroups: {
								include: {
									exercises: {
										include: {
											sets: true,
										},
									},
								},
							},
						},
					},
				},
			},
		},
	});

	// Count totals
	let groupCount = 0;
	let exerciseCount = 0;
	let setCount = 0;
	for (const week of program.weeks) {
		for (const day of week.days) {
			for (const group of day.exerciseGroups) {
				groupCount++;
				for (const exercise of group.exercises) {
					exerciseCount++;
					setCount += exercise.sets.length;
				}
			}
		}
	}

	console.log(`  Created "${name}" program:`);
	console.log(`    ${program.weeks.length} weeks`);
	console.log(
		`    ${program.weeks.reduce((sum, w) => sum + w.days.length, 0)} days`,
	);
	console.log(`    ${groupCount} exercise groups`);
	console.log(`    ${exerciseCount} exercises`);
	console.log(`    ${setCount} sets`);
}

// ===========================================================================
// STANDALONE "STRENGTH ON THE GO" WORKOUTS
//
// On-demand workouts that are not part of any program. Each is a single
// session (no weeks/days). Exercises reuse the shared Exercise catalog by name.
// The "Cardio" section is modelled as a normal group with label = 'Cardio'.
// ===========================================================================

interface SWSetInput {
	reps?: number | null;
	notes?: string;
	effortTarget?: string;
}

interface SWExerciseInput {
	name: string;
	sets: SWSetInput[];
}

interface SWGroupInput {
	type: ExerciseGroupType;
	label?: string;
	restSeconds?: number;
	exercises: SWExerciseInput[];
}

interface StandaloneWorkoutInput {
	category: string;
	order: number;
	groups: SWGroupInput[];
}

/** Single standalone set (reps may be null for carries / AMRAP finishers) */
const ws = (
	reps: number | null,
	opts?: { notes?: string; effortTarget?: string },
): SWSetInput => ({ reps, ...(opts ?? {}) });

/** N identical sets; an optional note is attached to the first set only */
const wr = (reps: number, count: number, firstNote?: string): SWSetInput[] =>
	Array.from({ length: count }, (_unused, i) =>
		i === 0 && firstNote ? { reps, notes: firstNote } : { reps },
	);

/** N percentage sets with the same reps (e.g. 8 sets of 10 @ 55%) */
const wpr = (
	reps: number,
	count: number,
	effortTarget: string,
	firstNote?: string,
): SWSetInput[] =>
	Array.from({ length: count }, (_unused, i) =>
		i === 0 && firstNote
			? { reps, effortTarget, notes: firstNote }
			: { reps, effortTarget },
	);

/** Percentage sets, same reps, one entry per percentage */
const wpct = (
	reps: number,
	percentages: number[],
	ref: string,
): SWSetInput[] =>
	percentages.map((p) => ({ reps, effortTarget: `${p}% of ${ref}` }));

/** Percentage sets with per-set reps: pairs of [reps, percentage] */
const wrpct = (pairs: Array<[number, number]>, ref: string): SWSetInput[] =>
	pairs.map(([reps, p]) => ({ reps, effortTarget: `${p}% of ${ref}` }));

/** Carry / distance sets — reps null, distance captured in notes */
const wcarry = (count: number, note: string): SWSetInput[] =>
	Array.from({ length: count }, () => ({ reps: null, notes: note }));

/** Single standalone exercise */
const wex = (name: string, ...sets: SWSetInput[]): SWExerciseInput => ({
	name,
	sets,
});

/** Standard (single-exercise) group */
const wsolo = (
	exercise: SWExerciseInput,
	restSeconds?: number,
): SWGroupInput => ({
	type: ExerciseGroupType.STANDARD,
	restSeconds,
	exercises: [exercise],
});

/** Superset group */
const wss = (
	exercises: SWExerciseInput[],
	restSeconds?: number,
): SWGroupInput => ({
	type: ExerciseGroupType.SUPERSET,
	restSeconds,
	exercises,
});

/** Cardio group (label = 'Cardio'); accepts a single exercise or a superset */
const cardio = (
	exercise: SWExerciseInput | SWExerciseInput[],
	restSeconds?: number,
): SWGroupInput =>
	Array.isArray(exercise)
		? {
				type: ExerciseGroupType.SUPERSET,
				label: 'Cardio',
				restSeconds,
				exercises: exercise,
			}
		: {
				type: ExerciseGroupType.STANDARD,
				label: 'Cardio',
				restSeconds,
				exercises: [exercise],
			};

const CHIN_TEMPO = 'Slow, strict tempo; add weight if needed';

const standaloneWorkouts: StandaloneWorkoutInput[] = [
	// ----------------------------------------------------------------- Upper Push
	{
		category: 'Upper Push',
		order: 1,
		groups: [
			wsolo(wex('Bench Press', ...wpct(5, [65, 70, 73, 75, 75], 'Bench 1RM')), 120),
			wss([
				wex('Barbell Standing Overhead Press', ...wr(5, 3)),
				wex('DB Rear Laterals', ...wr(20, 3)),
			], 120),
			wsolo(wex('EZ Bar or Straight Bar Skullcrushers', ...wr(10, 10)), 60),
			cardio(wex('DB Triceps Kickbacks', ws(10, { notes: 'AMRAP — as many sets of 10 reps as possible in 4 min' }))),
		],
	},
	{
		category: 'Upper Push',
		order: 2,
		groups: [
			wsolo(wex('Bench Press', ...wrpct([[8, 65], [6, 73], [4, 80], [2, 88]], 'Bench 1RM')), 150),
			wss([
				wex('DB Arnold Press', ...wr(10, 3, 'Seated')),
				wex('DB Laterals', ...wr(20, 3)),
			], 120),
			wsolo(wex('DB Triceps Tate Press', ...wr(10, 5, 'Google the exercise')), 90),
			cardio(wex('Cable or Band Pushdowns', ...wr(25, 4)), 90),
		],
	},
	{
		category: 'Upper Push',
		order: 3,
		groups: [
			wsolo(wex('Bench Press', ...wpr(8, 8, '50–55% of Bench 1RM')), 75),
			wsolo(wex('DB Incline Press', ws(5), ws(5), ws(5), ws(20)), 90),
			wss([
				wex('EZ Bar or Straight Bar Skullcrushers', ...wr(10, 4)),
				wex('Close Grip Pushups', ...wr(10, 4)),
			], 120),
			cardio(wex('DB Laterals', ...wr(20, 5)), 90),
		],
	},

	// ----------------------------------------------------------------- Upper Pull
	{
		category: 'Upper Pull',
		order: 1,
		groups: [
			wsolo(wex('Chin Up', ...wr(5, 4, `3–5 reps. ${CHIN_TEMPO}`)), 120),
			wss([
				wex('Chest Supported 2-Arm DB Rows', ws(5), ws(5), ws(10), ws(10), ws(15), ws(15)),
				wex('DB Shrugs', ...wr(20, 6)),
			], 75),
			wsolo(wex('DB Zottman Curls', ...wr(10, 5, 'Google the exercise')), 75),
			cardio(wex('Barbell Curls', ...wr(10, 3)), 90),
		],
	},
	{
		category: 'Upper Pull',
		order: 2,
		groups: [
			wsolo(wex('Pull Up', ...wr(5, 4, `3–5 reps. ${CHIN_TEMPO}`)), 120),
			wsolo(wex('1-Arm DB Row', ...wr(8, 5, 'Each arm')), 90),
			wsolo(wex('Barbell Curls', ...wr(5, 5, 'Heavy')), 120),
			cardio(wex('DB Concentration Curls', ...wr(15, 4)), 90),
		],
	},
	{
		category: 'Upper Pull',
		order: 3,
		groups: [
			wss([
				wex('DB Pullover', ...wr(5, 4)),
				wex('Barbell Bent Over Rows', ...wr(5, 4)),
			], 120),
			wsolo(wex('Chin Up', ...wr(2, 10, `${CHIN_TEMPO}`)), 60),
			wsolo(wex('Alt. DB Curls', ...wr(5, 4, 'Heavy, alternating')), 90),
			cardio(wex('DB Hammer Curls', ...wr(25, 4, 'Two-arm')), 90),
		],
	},

	// ----------------------------------------------------------------- Total Body
	{
		category: 'Total Body',
		order: 1,
		groups: [
			wsolo(wex('Back Squat', ...wrpct([[5, 65], [5, 70], [5, 75], [10, 60]], 'Back Squat 1RM')), 120),
			wss([
				wex('Bench Press', ...wrpct([[5, 65], [4, 75], [3, 80], [2, 87], [1, 92]], 'Bench 1RM')),
				wex('Snatch Grip Deadlift', ...wpr(3, 5, '50–60% of Deadlift 1RM', 'Use regular Deadlift max')),
			], 150),
			wss([
				wex('Cable or Band Face Pulls', ...wr(15, 3)),
				wex('DB Laterals', ...wr(15, 3)),
			], 120),
			cardio([
				wex('Close Grip Pushups', ...wr(10, 3, 'On each')),
				wex('Barbell Curls', ...wr(10, 3)),
			], 90),
		],
	},
	{
		category: 'Total Body',
		order: 2,
		groups: [
			wsolo(wex('Deadlift', ...wpct(4, [67, 75, 78, 80], 'Deadlift 1RM')), 120),
			wss([
				wex('Bench Press', ...wpct(10, [55, 60, 62], 'Bench 1RM')),
				wex('1-Arm DB Row', ...wr(5, 4)),
			], 150),
			wss([
				wex('DB Laterals', ...wr(10, 3)),
				wex('EZ Bar or Straight Bar Skullcrushers', ...wr(10, 3)),
				wex('DB Shrugs', ...wr(10, 3)),
			], 90),
			cardio(wex('Barbell 21s', ...wr(21, 3, 'Google the exercise')), 120),
		],
	},
	{
		category: 'Total Body',
		order: 3,
		groups: [
			wss([
				wex('Rear Foot Elevated DB Split Squat', ...wr(5, 4)),
				wex('DB Incline Press', ...wr(10, 4)),
			], 120),
			wss([
				wex('Barbell Standing Overhead Press', ...wr(5, 3)),
				wex('DB Pullover', ...wr(5, 3)),
			], 120),
			wss([
				wex('Cable or Band Pushdowns', ...wr(20, 4)),
				wex('Alt. DB Curls', ...wr(5, 4, 'Each arm, heavy')),
			], 90),
			cardio(wex('KB Swings', ...wr(15, 5)), 60),
		],
	},

	// ------------------------------------------------------------------- KB Only
	{
		category: 'KB Only',
		order: 1,
		groups: [
			wss([
				wex('KB Rear Foot Elevated Split Squat', ...wr(5, 4, 'KB each hand, front rack position')),
				wex('KB Reverse Lunges', ...wr(5, 4)),
			], 120),
			wss([
				wex('Single Arm KB Overhead Press', ...wr(5, 3, 'Each arm')),
				wex('KB Gorilla Rows', ...wr(5, 3, 'Google the exercise')),
			], 120),
			wsolo(wex('Single Arm KB Waiter Carry', ...wcarry(3, '20 yds each arm')), 60),
			cardio(wex('KB Swings', ...wr(10, 10)), 60),
		],
	},
	{
		category: 'KB Only',
		order: 2,
		groups: [
			wsolo(wex('Front Foot Elevated Single Arm KB Split Squat', ...wr(5, 5, 'Elevate front foot 3–5 inches')), 90),
			wss([
				wex('KB Single Leg RDL', ...wr(5, 4)),
				wex('KB Single Arm Row', ...wr(5, 4)),
			], 120),
			wsolo(wex('Double KB Waiter Carry', ws(null, { notes: '20 yds. Google the exercise' }), ...wcarry(3, '20 yds')), 90),
			cardio(wex('KB Swings', ...wr(8, 8)), 60),
		],
	},
	{
		category: 'KB Only',
		order: 3,
		groups: [
			wsolo(wex('KB Rear Foot Elevated Split Squat', ...wr(5, 4, 'Single arm, front rack position')), 90),
			wss([
				wex('Single Arm KB Overhead Press', ...wr(5, 4)),
				wex('KB Gorilla Rows', ...wr(5, 4)),
				wex('KB Swings', ...wr(10, 4)),
			], 120),
			wsolo(wex('Single Arm KB Suitcase Carry', ...wcarry(3, '20 yds each arm')), 60),
			cardio(wex('KB Swings', ...wr(15, 6)), 75),
		],
	},

	// ------------------------------------------------------------------ Arms Only
	{
		category: 'Arms Only',
		order: 1,
		groups: [
			wss([
				wex('Barbell Curls', ws(5), ws(8), ws(10), ws(12)),
				wex('DB Skullcrushers', ws(12, { notes: '2 hands on one DB. Google the exercise' }), ws(10), ws(8), ws(5)),
			], 90),
			wss([
				wex('Close Grip Bench', ...wr(10, 3)),
				wex('Cable or Band Pushdowns', ...wr(20, 3)),
			], 120),
			wsolo(wex('DB Zottman Curls', ...wr(10, 4, 'Google the exercise')), 90),
			cardio(wex('DB Triceps Tate Press', ...wr(20, 5)), 75),
		],
	},
	{
		category: 'Arms Only',
		order: 2,
		groups: [
			wss([
				wex('EZ Bar or Straight Bar Skullcrushers', ...wr(20, 4)),
				wex('Alt. DB Curls', ...wr(5, 4, 'Heavy')),
			], 120),
			wss([
				wex('Barbell 21s', ...wr(21, 3, 'Google the exercises')),
				wex('DB Triceps Kickbacks', ...wr(15, 3)),
			], 120),
			wsolo(wex('Close Grip Pushups', ...wr(10, 5)), 90),
			cardio(wex('Cable or Band Pushdowns', ...wr(20, 5)), 90),
		],
	},
	{
		category: 'Arms Only',
		order: 3,
		groups: [
			wss([
				wex('Close Grip Bench', ...wr(10, 10)),
				wex('DB Hammer Curls', ...wr(10, 10, 'Two-arm')),
			], 75),
			wss([
				wex('DB Concentration Curls', ...wr(10, 5)),
				wex('DB Triceps Kickbacks', ...wr(10, 5)),
			], 75),
			wsolo(wex('Barbell Curls', ...wr(5, 4, 'Heavy')), 90),
			cardio(wex('EZ Bar or Straight Bar Skullcrushers', ...wr(20, 5)), 90),
		],
	},

	// ---------------------------------------------------------------- Deads/Bench
	{
		category: 'Deads/Bench',
		order: 1,
		groups: [
			wsolo(
				wex(
					'Bench Press',
					...wpr(10, 2, '55% of Bench 1RM'),
					...wpr(7, 2, '67% of Bench 1RM'),
					...wpr(5, 3, '75% of Bench 1RM'),
					ws(null, { effortTarget: '80% of Bench 1RM', notes: 'AMRAP — record number of reps' }),
				),
				150,
			),
			wsolo(wex('Deadlift', ...wpct(5, [65, 70, 75, 77, 80], 'Deadlift 1RM')), 150),
			cardio(wex('DB Shrugs', ...wr(20, 3)), 75),
		],
	},
	{
		category: 'Deads/Bench',
		order: 2,
		groups: [
			wsolo(
				wex(
					'Deadlift',
					...wpr(4, 2, '70% of Deadlift 1RM'),
					...wpr(3, 2, '80% of Deadlift 1RM'),
					...wpr(2, 2, '87% of Deadlift 1RM'),
					...wpr(5, 1, '80% of Deadlift 1RM'),
				),
				120,
			),
			wsolo(
				wex('Bench Press', ...wrpct(
					[[4, 70], [3, 80], [2, 85], [1, 90], [4, 75], [3, 83], [2, 88], [1, 93]],
					'Bench 1RM',
				)),
				150,
			),
			cardio(wex('KB Swings', ...wr(15, 3)), 75),
		],
	},
	{
		category: 'Deads/Bench',
		order: 3,
		groups: [
			wsolo(wex('Bench Press', ...wpr(10, 10, '55% of Bench 1RM')), 150),
			wsolo(wex('Deadlift', ...wpct(3, [65, 75, 80, 85, 88], 'Deadlift 1RM')), 150),
			cardio(wex('DB Farmers Walk', ...wcarry(4, '30 yds. DB or KB')), 90),
		],
	},

	// ----------------------------------------------------------------- Lower Body
	{
		category: 'Lower Body',
		order: 1,
		groups: [
			wsolo(wex('Back Squat', ...wrpct([[5, 65], [5, 70], [5, 75], [5, 77], [10, 60]], 'Back Squat 1RM')), 150),
			wsolo(wex('Barbell Reverse Lunge', ...wr(5, 3, '5 each leg, do not alternate')), 120),
			wsolo(wex('Barbell RDLs', ...wr(5, 4)), 120),
			cardio(wex('KB Goblet Squats', ...wr(10, 5)), 75),
		],
	},
	{
		category: 'Lower Body',
		order: 2,
		groups: [
			wsolo(wex('Back Squat', ...wpr(8, 3, '60% of Back Squat 1RM')), 120),
			wsolo(wex('Barbell Rear Foot Elevated Split Squat', ...wr(5, 4)), 120),
			wsolo(wex('Back Squat', ...wpr(5, 5, '67% of Back Squat 1RM')), 120),
			cardio(wex('DB RDLs', ...wr(10, 4)), 90),
		],
	},
	{
		category: 'Lower Body',
		order: 3,
		groups: [
			wsolo(wex('Back Squat', ...wpr(8, 8, '60% of Back Squat 1RM')), 120),
			wsolo(wex('Front Squat', ...wpr(5, 4, '50–55% of Back Squat 1RM', '% taken from Back Squat max')), 120),
			wsolo(wex('Rear Foot Elevated DB Split Squat', ...wr(10, 3, '10 each leg')), 120),
			cardio(wex('Bodyweight Walking Lunges', ...wr(20, 3, '10 each leg')), 120),
		],
	},

	// ------------------------------------------------------------------- DB Only
	{
		category: 'DB Only',
		order: 1,
		groups: [
			wss([
				wex('Rear Foot Elevated DB Split Squat', ...wr(5, 4)),
				wex('DB Incline Press', ...wr(10, 4)),
			], 120),
			wss([
				wex('DB Arnold Press', ...wr(10, 4, 'Seated')),
				wex('1-Arm DB Row', ...wr(5, 4)),
			], 90),
			wss([
				wex('DB Zottman Curls', ...wr(10, 4)),
				wex('DB Skullcrushers', ...wr(10, 4, 'Two DBs for skulls')),
			], 90),
			cardio([
				wex('DB RDLs', ...wr(10, 3)),
				wex('DB Shrugs', ...wr(10, 3)),
			], 60),
		],
	},
	{
		category: 'DB Only',
		order: 2,
		groups: [
			wsolo(wex('DB Incline Press', ...wr(8, 4)), 120),
			wsolo(wex('Chest Supported 2-Arm DB Rows', ...wr(10, 10)), 60),
			wss([
				wex('DB Reverse Lunge', ...wr(5, 4)),
				wex('DB RDLs', ...wr(10, 4)),
			], 90),
			cardio(wex('DB Triceps Kickbacks', ...wr(15, 4)), 90),
		],
	},
	{
		category: 'DB Only',
		order: 3,
		groups: [
			wss([
				wex('DB Goblet Squats', ...wr(10, 5)),
				wex('DB Pullover', ...wr(5, 5)),
			], 75),
			wsolo(wex('DB Incline Press', ...wr(10, 10)), 75),
			wsolo(wex('1-Arm DB Row', ...wr(5, 4)), 90),
			cardio(wex('Alt. DB Curls', ...wr(5, 5, 'Heavy, alternating')), 75),
		],
	},
];

/** Collect all unique exercise names used by the standalone workouts */
function collectStandaloneExerciseNames(
	workouts: StandaloneWorkoutInput[],
): Set<string> {
	const names = new Set<string>();
	for (const workout of workouts) {
		for (const group of workout.groups) {
			for (const exercise of group.exercises) {
				names.add(canonicalizeName(exercise.name));
			}
		}
	}
	return names;
}

/**
 * Seed the standalone "on the go" workouts. Upserts any new exercise names into
 * the shared catalog, then creates each workout (skipping any that already
 * exist by category + order, to preserve user sessions).
 */
async function seedStandaloneWorkouts(): Promise<void> {
	const exerciseNames = collectStandaloneExerciseNames(standaloneWorkouts);
	for (const name of exerciseNames) {
		await prisma.exercise.upsert({
			where: { name },
			update: {},
			create: { name },
		});
	}
	console.log(
		`  Upserted ${exerciseNames.size} exercise names for standalone workouts`,
	);

	let created = 0;
	let skipped = 0;
	for (const workout of standaloneWorkouts) {
		const existing = await prisma.standaloneWorkout.findUnique({
			where: {
				category_order: {
					category: workout.category,
					order: workout.order,
				},
			},
		});
		if (existing) {
			skipped++;
			continue;
		}

		await prisma.standaloneWorkout.create({
			data: {
				category: workout.category,
				order: workout.order,
				groups: {
					create: workout.groups.map((group, groupIdx) => ({
						order: groupIdx + 1,
						type: group.type,
						label: group.label,
						restSeconds: group.restSeconds,
						exercises: {
							create: group.exercises.map(
								(exercise, exIdx) => ({
									exercise: {
										connect: {
											name: canonicalizeName(exercise.name),
										},
									},
									order: exIdx + 1,
									sets: {
										create: exercise.sets.map(
											(set, setIdx) => ({
												setNumber: setIdx + 1,
												reps: set.reps ?? null,
												notes: set.notes,
												effortTarget: set.effortTarget,
											}),
										),
									},
								}),
							),
						},
					})),
				},
			},
		});
		created++;
	}
	console.log(
		`  Standalone workouts: ${created} created, ${skipped} already existed`,
	);
}

// Sparse demonstration-media map keyed by canonical exercise name. Fill entries
// in over time as YouTube links (and later stored gif/animation URLs) are
// gathered; missing entries leave videoUrl/animationUrl null. Spread into both
// catalog upserts below so re-seeding is idempotent and updates existing rows.
const EXERCISE_MEDIA: Record<string, { videoUrl?: string; animationUrl?: string }> = {
	// 'Deadlift': { videoUrl: 'https://youtu.be/...' },
	// 'Plank': { videoUrl: 'https://youtu.be/...' },
};

async function main(): Promise<void> {
	console.log('Seeding programs...\n');

	// Collect and upsert all exercise names across all programs
	const exerciseNames = collectExerciseNames(
		brickHouseWeeks,
		armFarmWeeks,
		armFarm2Weeks,
		drJackedWeeks,
		meatWagonWeeks,
		poolSeasonWeeks,
		poolSeason2Weeks,
		oakTreeWeeks,
		ptotWeeks,
		fothWeeks,
		squatoberWeeks,
	);
	for (const name of exerciseNames) {
		await prisma.exercise.upsert({
			where: { name },
			update: { ...(EXERCISE_MEDIA[name] ?? {}) },
			create: { name, ...(EXERCISE_MEDIA[name] ?? {}) },
		});
	}
	console.log(`Upserted ${exerciseNames.size} exercises\n`);

	// Core exercise catalog for the workout core-circuit feature. This list is
	// canonical: re-runs converge the catalog to exactly these names.
	// update sets isCore so a name already seeded by a program gets flagged too.
	const CORE_EXERCISES = [
		'Plank',
		'Hanging Leg Raise',
		'Cable Crunch',
		'Russian Twist',
		'Ab Wheel Rollout',
		'Dead Bug',
		'Bicycle Crunch',
		'Mountain Climber',
	];
	for (const name of CORE_EXERCISES) {
		await prisma.exercise.upsert({
			where: { name },
			update: { isCore: true, ...(EXERCISE_MEDIA[name] ?? {}) },
			create: { name, isCore: true, ...(EXERCISE_MEDIA[name] ?? {}) },
		});
	}
	// Converge: exercises flagged core by earlier seed versions but no longer in
	// the catalog are deleted when unreferenced, otherwise just unflagged.
	const staleCore = await prisma.exercise.findMany({
		where: { isCore: true, name: { notIn: CORE_EXERCISES } },
		include: {
			_count: {
				select: {
					programExercises: true,
					userExerciseNotes: true,
					originalSwaps: true,
					replacementSwaps: true,
					coreWorkoutExercises: true,
				},
			},
		},
	});
	for (const stale of staleCore) {
		const referenced = Object.values(stale._count).some((count) => count > 0);
		if (referenced) {
			await prisma.exercise.update({
				where: { id: stale.id },
				data: { isCore: false },
			});
		} else {
			await prisma.exercise.delete({ where: { id: stale.id } });
		}
	}
	console.log(
		`Upserted ${CORE_EXERCISES.length} core exercises (${staleCore.length} stale removed/unflagged)\n`,
	);

	// Seed each program
	console.log('Seeding Brick House...');
	await seedProgram(
		BRICK_HOUSE_NAME,
		BRICK_HOUSE_DESCRIPTION,
		brickHouseWeeks,
	);

	console.log('\nSeeding Coach Caulfield\'s Arm Farm...');
	await seedProgram(
		ARM_FARM_NAME,
		ARM_FARM_DESCRIPTION,
		armFarmWeeks,
	);

	console.log('\nSeeding Arm Farm 2...');
	await seedProgram(
		ARM_FARM_2_NAME,
		ARM_FARM_2_DESCRIPTION,
		armFarm2Weeks,
	);

	console.log('\nSeeding The Return of Dr. Jacked...');
	await seedProgram(
		DR_JACKED_NAME,
		DR_JACKED_DESCRIPTION,
		drJackedWeeks,
	);

	console.log('\nSeeding Meat Wagon...');
	await seedProgram(
		MEAT_WAGON_NAME,
		MEAT_WAGON_DESCRIPTION,
		meatWagonWeeks,
	);

	console.log('\nSeeding Pool Season...');
	await seedProgram(
		POOL_SEASON_NAME,
		POOL_SEASON_DESCRIPTION,
		poolSeasonWeeks,
	);

	console.log('\nSeeding Pool Season 2...');
	await seedProgram(
		POOL_SEASON_2_NAME,
		POOL_SEASON_2_DESCRIPTION,
		poolSeason2Weeks,
	);

	console.log('\nSeeding Oak Tree...');
	await seedProgram(OAK_TREE_NAME, OAK_TREE_DESCRIPTION, oakTreeWeeks);

	console.log('\nSeeding Periodic Table of Thickness...');
	await seedProgram(PTOT_NAME, PTOT_DESCRIPTION, ptotWeeks);

	console.log('\nSeeding Filling Out That Hoodie...');
	await seedProgram(FOTH_NAME, FOTH_DESCRIPTION, fothWeeks);

	console.log('\nSeeding Squatober The Prequel...');
	await seedProgram(SQUATOBER_NAME, SQUATOBER_DESCRIPTION, squatoberWeeks);

	console.log('\nSeeding standalone (on the go) workouts...');
	await seedStandaloneWorkouts();
}

main()
	.then(() => {
		console.log('\nSeed completed successfully.');
	})
	.catch((e) => {
		console.error('Seed failed:', e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
