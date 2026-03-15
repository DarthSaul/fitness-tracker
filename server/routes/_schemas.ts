/**
 * Centralized OpenAPI component schemas.
 *
 * Registered via Nitro's `defineRouteMeta` with `$global` so that all
 * reusable `components.schemas` are available across routes.
 *
 * Lives in `server/routes/` (not `server/api/`) so it is still scanned by
 * Nitro (required for `$global` to work) but does not appear under the
 * "API Routes" tag in generated docs.
 */
defineRouteMeta({
	openAPI: {
		$global: {
			components: {
				schemas: {
					ExerciseSet: {
						type: 'object',
						properties: {
							id: {
								type: 'string',
								example: 'cm5abc123set01',
							},
							programExerciseId: {
								type: 'string',
								example: 'cm5abc123ex01',
							},
							setNumber: {
								type: 'integer',
								example: 1,
							},
							reps: {
								type: [
									'integer',
									'null',
								],
								example: 8,
							},
							weight: {
								type: [
									'number',
									'null',
								],
								example: 185.0,
							},
							rpe: {
								type: [
									'number',
									'null',
								],
								example: 8.5,
							},
							notes: {
								type: [
									'string',
									'null',
								],
								example: '75% of working weight',
							},
						},
					},
					Exercise: {
						type: 'object',
						properties: {
							id: {
								type: 'string',
								example: 'cm5abc123exr01',
							},
							name: {
								type: 'string',
								example: 'Barbell Back Squat',
							},
							description: {
								type: [
									'string',
									'null',
								],
								example: null,
							},
						},
					},
					ProgramExercise: {
						type: 'object',
						properties: {
							id: {
								type: 'string',
								example: 'cm5abc123ex01',
							},
							exerciseGroupId: {
								type: 'string',
								example: 'cm5abc123grp01',
							},
							exerciseId: {
								type: 'string',
								example: 'cm5abc123exr01',
							},
							order: {
								type: 'integer',
								example: 1,
							},
							exercise: {
								$ref: '#/components/schemas/Exercise',
							},
							sets: {
								type: 'array',
								items: {
									$ref: '#/components/schemas/ExerciseSet',
								},
							},
						},
					},
					ExerciseGroup: {
						type: 'object',
						properties: {
							id: {
								type: 'string',
								example: 'cm5abc123grp01',
							},
							programDayId: {
								type: 'string',
								example: 'cm5abc123day01',
							},
							order: {
								type: 'integer',
								example: 1,
							},
							type: {
								type: 'string',
								enum: [
									'STANDARD',
									'SUPERSET',
								],
								example: 'STANDARD',
							},
							restSeconds: {
								type: [
									'integer',
									'null',
								],
								example: 90,
							},
							exercises: {
								type: 'array',
								items: {
									$ref: '#/components/schemas/ProgramExercise',
								},
							},
						},
					},
					ProgramDay: {
						type: 'object',
						properties: {
							id: {
								type: 'string',
								example: 'cm5abc123day01',
							},
							programWeekId: {
								type: 'string',
								example: 'cm5abc123week01',
							},
							dayNumber: {
								type: 'integer',
								example: 1,
							},
							name: {
								type: [
									'string',
									'null',
								],
								example: 'Lower Body',
							},
							warmUp: {
								type: [
									'string',
									'null',
								],
								example: '5 min bike + dynamic stretches',
							},
							exerciseGroups: {
								type: 'array',
								items: {
									$ref: '#/components/schemas/ExerciseGroup',
								},
							},
						},
					},
					ProgramWeek: {
						type: 'object',
						properties: {
							id: {
								type: 'string',
								example: 'cm5abc123week01',
							},
							programId: {
								type: 'string',
								example: 'cm5abc123prog01',
							},
							weekNumber: {
								type: 'integer',
								example: 1,
							},
							days: {
								type: 'array',
								items: {
									$ref: '#/components/schemas/ProgramDay',
								},
							},
						},
					},
					ProgramDetail: {
						type: 'object',
						properties: {
							id: {
								type: 'string',
								example: 'cm5abc123prog01',
							},
							name: {
								type: 'string',
								example: 'Brick House',
							},
							description: {
								type: [
									'string',
									'null',
								],
								example: 'A 4-week, 5-day/week strength program.',
							},
							createdAt: {
								type: 'string',
								format: 'date-time',
								example: '2026-01-15T12:00:00.000Z',
							},
							weeks: {
								type: 'array',
								items: {
									$ref: '#/components/schemas/ProgramWeek',
								},
							},
						},
					},
					ProgramSummary: {
						type: 'object',
						properties: {
							id: {
								type: 'string',
								example: 'cm5abc123prog01',
							},
							name: {
								type: 'string',
								example: 'Brick House',
							},
							description: {
								type: [
									'string',
									'null',
								],
								example: 'A 4-week, 5-day/week strength program.',
							},
							createdAt: {
								type: 'string',
								format: 'date-time',
								example: '2026-01-15T12:00:00.000Z',
							},
							_count: {
								type: 'object',
								properties: {
									weeks: {
										type: 'integer',
										example: 4,
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

export default defineEventHandler(() => null);
