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
						ex('2-Arm Chest Supported DB Rows', ...r(25, 3)),
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
							'BB Standing Overhead Press',
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
							ex('BB RDLs', ...r(10, 3)),
						],
						120,
					),
					solo(
						ex(
							'BB Bent Over Rows',
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
							'2-Arm Chest Supported DB Rows',
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
							ex('BB Bent Over Rows', ...r(10, 3)),
							ex('DB Pullover', ...r(10, 3)),
						],
						150,
					),
					solo(
						ex(
							'BB Standing Overhead Press',
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
							'2-Arm Chest Supported DB Rows',
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
							'BB Standing Overhead Press',
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
							'BB Bent Over Rows',
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
						ex('BB Shrugs', ...r(10, 3)),
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
						ex('BB Shrugs', ...r(25, 2)),
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
							'BB Standing Overhead Press',
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
								'BB Rear Foot Elevated Split Squat',
								...r(5, 3),
							),
							ex('DB RDLs', ...r(10, 3)),
						],
						150,
					),
					solo(ex('DB Pullover', ...r(10, 4))),
					solo(
						ex(
							'BB Standing Overhead Press',
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
							'BB Bent Over Rows',
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
						ex('Band or Cable Pushdowns', ...r(25, 3)),
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
							ex('BB Goodmornings', ...r(10, 3)),
						],
						150,
					),
					solo(ex('1-Arm DB Row', ...r(5, 4))),
					solo(
						ex(
							'BB Standing Overhead Press',
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
						ex('Chin Up (Weighted)', ...r(3, 3)),
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
							'BB Standing Overhead Press',
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
							'BB Shrugs',
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
							ex('BB Goodmornings', ...r(10, 3)),
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
							'BB Standing Overhead Press',
							s(5),
							s(10),
							s(15),
						),
					),
					ss([
						ex('DB Rear Laterals', ...r(20, 3)),
						ex('BB Upright Rows', ...r(10, 3)),
					]),
					ss([
						ex('Cable or Band Pushdowns', ...r(25, 2)),
						ex('BB Curls', ...r(25, 2)),
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
							'BB Standing Overhead Press',
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
						ex('BB Reverse Curls', ...r(10, 4)),
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
							ex('BB Goodmornings', ...r(8, 4)),
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
							ex('BB Bent Over Rows', ...r(10, 3)),
							ex(
								'BB RDLs',
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
								'BB Shrugs',
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
							ex('BB Shrugs', ...r(10, 4)),
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
							'BB Standing Overhead Press',
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
							'BB Bent Over Rows',
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
							'BB Standing Overhead Press',
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
							'BB Reverse Curls',
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
							'BB Bent Over Rows',
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
							ex('BB Goodmornings', ...r(10, 3)),
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
							'BB Incline Press',
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
							ex('BB Shrugs', ...r(10, 3)),
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
							'BB Standing Overhead Press',
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
							'BB Reverse Curls',
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
							ex('BB Goodmornings', ...r(10, 4)),
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
							'BB Incline Press',
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

async function main(): Promise<void> {
	console.log('Seeding programs...\n');

	// Collect and upsert all exercise names across all programs
	const exerciseNames = collectExerciseNames(
		brickHouseWeeks,
		armFarmWeeks,
	);
	for (const name of exerciseNames) {
		await prisma.exercise.upsert({
			where: { name },
			update: {},
			create: { name },
		});
	}
	console.log(`Upserted ${exerciseNames.size} exercises\n`);

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
