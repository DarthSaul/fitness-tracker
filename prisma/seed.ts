import { PrismaClient, ExerciseGroupType } from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helper types & functions for compact data entry
// ---------------------------------------------------------------------------

interface SetInput {
	reps: number;
	notes?: string;
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

/** N identical sets */
const r = (reps: number, count: number): SetInput[] =>
	Array.from({ length: count }, () => s(reps));

/** Percentage-based sets (same reps, different %) */
const pct = (reps: number, percentages: number[], ref: string): SetInput[] =>
	percentages.map((p) => s(reps, `${p}% of ${ref}`));

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

const PROGRAM_NAME = 'Brick House';
const PROGRAM_DESCRIPTION =
	'A 4-week, 5-day/week strength program. ' +
	'Progressive overload through percentage-based programming focused on the three main compound lifts: deadlift, squat, and bench press.';

const weeks: WeekInput[] = [
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
							...pct(
								5,
								[
									60, 65,
									70, 70,
								],
								'Deadlift 1RM',
							),
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
							...pct(
								5,
								[
									60, 65,
									70, 75,
								],
								'Bench 1RM',
							),
						),
						120,
					),
					ss([
						ex(
							'Barbell Curls',
							...r(10, 4),
						),
						ex(
							'Dips or Bench Dips',
							...r(10, 5),
						),
					]),
					ss([
						ex(
							'2-Arm Chest Supported DB Rows',
							...r(25, 3),
						),
						ex(
							'Barbell Shrugs',
							...r(10, 3),
						),
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
							...pct(
								3,
								[
									60, 65,
									70, 75,
									80,
								],
								'Back Squat 1RM',
							),
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
							ex(
								'Chin Up',
								...r(3, 5),
							),
						],
						120,
					),
					solo(
						ex(
							'BB Standing Overhead Press',
							s(
								5,
								'Start ~35% of Bench 1RM; strict, slow, no legs',
							),
							s(5),
							s(5),
							s(5),
						),
						120,
					),
					solo(
						ex(
							'DB Rear Laterals',
							...r(25, 4),
						),
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
								s(
									5,
									'Each leg, alternating',
								),
								s(5),
								s(5),
							),
							ex(
								'BB RDLs',
								...r(10, 3),
							),
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
							s(
								10,
								'Start ~20% of Bench 1RM',
							),
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
						ex(
							'Cable or Band Pushdowns',
							...r(25, 3),
						),
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
							...pct(
								5,
								[
									50, 50,
									50, 50,
								],
								'Deadlift 1RM',
							),
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
							...pct(
								10,
								[
									55, 60,
									65, 65,
								],
								'Bench 1RM',
							),
						),
					),
					ss([
						ex(
							'DB Rear Laterals',
							...r(15, 3),
						),
						ex(
							'DB Upright Rows',
							...r(15, 3),
						),
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
							s(
								5,
								'45% of Back Squat 1RM',
							),
							s(
								5,
								'50% of Back Squat 1RM',
							),
							s(
								5,
								'55% of Back Squat 1RM',
							),
							s(
								10,
								'45% of Back Squat 1RM',
							),
						),
						150,
					),
					ss(
						[
							ex(
								'BB Bent Over Rows',
								...r(10, 3),
							),
							ex(
								'DB Pullover',
								...r(10, 3),
							),
						],
						150,
					),
					solo(
						ex(
							'BB Standing Overhead Press',
							s(
								10,
								'Start ~30% of Bench 1RM',
							),
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
					solo(
						ex(
							'DB Rear Laterals',
							...r(25, 3),
						),
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
			// Week 2, Day 1
			// -----------------------------------------------------------------------
			{
				dayNumber: 1,
				warmUp: '3 rounds: BW Split Squats x5 each leg / Empty Bar Front Squats x5',
				exerciseGroups: [
					ss([
						ex(
							'Rear Foot Elevated DB Split Squat',
							...r(5, 4),
						),
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
							...pct(
								5,
								[
									65, 70,
									75, 80,
								],
								'Bench 1RM',
							),
						),
						150,
					),
					solo(
						ex(
							'DB Rear Laterals',
							...r(20, 4),
						),
					),
					ss([
						ex(
							'Dips or Bench Dips',
							...r(10, 3),
						),
						ex(
							'DB Hammer Curls',
							...r(20, 3),
						),
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
							...pct(
								5,
								[
									60, 70,
									75, 75,
								],
								'Deadlift 1RM',
							),
						),
						150,
					),
					ss(
						[
							ex(
								'Chin Up',
								s(
									3,
									'Weighted if able',
								),
								s(3),
								s(3),
							),
							ex(
								'1-Arm DB Row',
								...r(5, 3),
							),
						],
						150,
					),
					solo(
						ex(
							'BB Standing Overhead Press',
							s(
								10,
								'Start ~30% of Bench 1RM',
							),
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
						ex(
							'DB Upright Rows',
							...r(15, 2),
						),
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
								[
									65, 70,
									75, 80,
									85,
								],
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
						ex(
							'DB Rear Laterals',
							...r(20, 3),
						),
						ex('BB Shrugs', ...r(10, 3)),
					]),
					// Cardio: Day Off (no cardio exercises)
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
								s(
									5,
									'Each leg',
								),
								s(5),
								s(5),
								s(5),
							),
							ex(
								'DB Goblet Squats',
								...r(10, 4),
							),
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
							...pct(
								12,
								[55, 60, 65],
								'Bench 1RM',
							),
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
						ex(
							'DB Rear Laterals',
							...r(10, 2),
						),
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
							...pct(
								10,
								[45, 45, 45],
								'Deadlift 1RM',
							),
						),
						180,
					),
					ss(
						[
							ex(
								'DB Pullover',
								...r(5, 3),
							),
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
							s(
								5,
								'Start ~37.5% of Bench 1RM',
							),
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
							s(
								4,
								'50% of Back Squat 1RM',
							),
							s(
								4,
								'55% of Back Squat 1RM',
							),
							s(
								4,
								'60% of Back Squat 1RM',
							),
							s(
								10,
								'50% of Back Squat 1RM',
							),
						),
						150,
					),
					solo(
						ex(
							'Pull Up',
							s(
								3,
								'Weighted if able',
							),
							s(3),
							s(3),
							s(3),
						),
					),
					solo(
						ex(
							'Bench Press',
							...pct(
								3,
								[
									65, 70,
									75, 80,
									85,
								],
								'Bench 1RM',
							),
						),
					),
					ss([
						ex(
							'Dips or Bench Dips',
							...r(10, 3),
						),
						ex('Alt. DB Curls', ...r(5, 3)),
					]),
					// Cardio: No Cardio / Day Off
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
							ex(
								'DB RDLs',
								...r(10, 3),
							),
						],
						150,
					),
					solo(ex('DB Pullover', ...r(10, 4))),
					solo(
						ex(
							'BB Standing Overhead Press',
							s(
								10,
								'Start ~30% of Bench 1RM; strict, slow, no legs',
							),
							s(10),
							s(10),
						),
					),
					solo(
						ex(
							'DB Rear Laterals',
							...r(20, 3),
						),
					),
					ss([
						ex(
							'Cable or Band Pushdowns',
							...r(20, 3),
						),
						ex(
							'Barbell Curls',
							...r(10, 3),
						),
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
								[
									65, 70,
									75, 80,
									85,
								],
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
						ex(
							'DB Rear Laterals',
							...r(20, 3),
						),
					]),
					solo(
						ex(
							'DB Incline Press',
							s(
								5,
								'Start ~22-25% of Bench 1RM',
							),
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
							...pct(
								5,
								[60, 65, 70],
								'Back Squat 1RM',
							),
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
							...pct(
								15,
								[50, 55, 60],
								'Bench 1RM',
							),
						),
						180,
					),
					ss(
						[
							ex(
								'DB Rear Laterals',
								...r(20, 3),
							),
							ex(
								'DB Upright Rows',
								...r(5, 3),
							),
						],
						90,
					),
					solo(
						ex(
							'Band or Cable Pushdowns',
							...r(25, 3),
						),
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
								s(
									5,
									'Each leg',
								),
								s(5),
								s(5),
								s(5),
							),
							ex(
								'BB Goodmornings',
								...r(10, 3),
							),
						],
						150,
					),
					solo(ex('1-Arm DB Row', ...r(5, 4))),
					solo(
						ex(
							'BB Standing Overhead Press',
							s(
								5,
								'Start ~37.5% of Bench 1RM',
							),
							s(5),
							s(5),
						),
					),
					solo(ex('Barbell 21s', ...r(21, 3))),
					// Cardio: No Extra Cardio
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
							...pct(
								5,
								[50, 52.5, 55],
								'Deadlift 1RM',
							),
						),
						150,
					),
					ss([
						ex('DB Pullover', ...r(5, 3)),
						ex(
							'Chin Up (Weighted)',
							...r(3, 3),
						),
					]),
					solo(
						ex(
							'Bench Press',
							s(
								5,
								'70% of Bench 1RM',
							),
							s(
								4,
								'80% of Bench 1RM',
							),
							s(
								3,
								'85% of Bench 1RM',
							),
							s(
								2,
								'90% of Bench 1RM',
							),
							s(
								1,
								'95% of Bench 1RM',
							),
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
					solo(
						ex(
							'Weighted Pushups',
							...r(10, 3),
						),
					),
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
							...pct(
								5,
								[50, 50, 50],
								'Back Squat 1RM',
							),
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
							s(
								10,
								'Start ~30-32% of Bench 1RM',
							),
							s(10),
							s(10),
						),
					),
					ss([
						ex(
							'EZ Bar or Straight Bar Skullcrushers',
							...r(10, 3),
						),
						ex(
							'DB Hammer Curls',
							...r(20, 3),
						),
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
								s(
									5,
									'Each leg',
								),
								s(5),
								s(5),
							),
							ex(
								'BB Goodmornings',
								...r(10, 3),
							),
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
							s(
								5,
								'Start ~22-25% of Bench 1RM',
							),
							s(5),
							s(5),
							s(5),
						),
					),
					solo(
						ex(
							'DB Rear Laterals',
							...r(20, 3),
						),
					),
					// Cardio: No Cardio
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
							...pct(
								3,
								[
									60, 70,
									75, 80,
								],
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
						ex(
							'DB Rear Laterals',
							...r(20, 3),
						),
					]),
					solo(
						ex(
							'Bench Press',
							...pct(
								5,
								[
									65, 70,
									75, 80,
								],
								'Bench 1RM',
							),
							s(
								20,
								'50% of Bench 1RM',
							),
						),
						150,
					),
					solo(
						ex(
							'Close Grip Weighted Pushups',
							...r(10, 4),
						),
					),
					ss([
						ex(
							'Barbell Curls',
							...r(10, 3),
						),
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
							s(
								5,
								'60% of Back Squat 1RM',
							),
							s(
								6,
								'60% of Back Squat 1RM',
							),
							s(
								7,
								'60% of Back Squat 1RM',
							),
							s(
								8,
								'60% of Back Squat 1RM',
							),
							s(
								9,
								'60% of Back Squat 1RM',
							),
							s(
								10,
								'60% of Back Squat 1RM',
							),
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
						ex(
							'DB Rear Laterals',
							...r(20, 3),
						),
						ex(
							'BB Upright Rows',
							...r(10, 3),
						),
					]),
					ss([
						ex(
							'Cable or Band Pushdowns',
							...r(25, 2),
						),
						ex('BB Curls', ...r(25, 2)),
					]),
				],
			},
		],
	},
];

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	console.log('Seeding Brick House program...');

	// Collect all unique exercise names from the program data
	const exerciseNames = new Set<string>();
	for (const week of weeks) {
		for (const day of week.days) {
			for (const group of day.exerciseGroups) {
				for (const exercise of group.exercises) {
					exerciseNames.add(exercise.name);
				}
			}
		}
	}

	// Upsert each exercise into the Exercise table
	for (const name of exerciseNames) {
		await prisma.exercise.upsert({
			where: { name },
			update: {},
			create: { name },
		});
	}
	console.log(`  Upserted ${exerciseNames.size} exercises`);

	// Delete existing program (cascade handles children)
	const deleted = await prisma.program.deleteMany({
		where: { name: PROGRAM_NAME },
	});
	if (deleted.count > 0) {
		console.log(
			`  Deleted ${deleted.count} existing "${PROGRAM_NAME}" program(s)`,
		);
	}

	// Create the full program hierarchy in one nested create
	const program = await prisma.program.create({
		data: {
			name: PROGRAM_NAME,
			description: PROGRAM_DESCRIPTION,
			weeks: {
				create: weeks.map((week) => ({
					weekNumber: week.weekNumber,
					days: {
						create: week.days.map(
							(day) => ({
								dayNumber: day.dayNumber,
								name: `Week ${week.weekNumber} Day ${day.dayNumber}`,
								warmUp: day.warmUp,
								exerciseGroups:
									{
										create: day.exerciseGroups.map(
											(
												group,
												groupIdx,
											) => ({
												order:
													groupIdx +
													1,
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
																connect: {
																	name: exercise.name,
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
																	}),
																),
															},
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

	console.log(`  Created "${PROGRAM_NAME}" program:`);
	console.log(`    ${program.weeks.length} weeks`);
	console.log(
		`    ${program.weeks.reduce((sum, w) => sum + w.days.length, 0)} days`,
	);
	console.log(`    ${groupCount} exercise groups`);
	console.log(`    ${exerciseCount} exercises`);
	console.log(`    ${setCount} sets`);
}

main()
	.then(() => {
		console.log('Seed completed successfully.');
	})
	.catch((e) => {
		console.error('Seed failed:', e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
