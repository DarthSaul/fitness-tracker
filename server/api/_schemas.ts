/**
 * Centralized OpenAPI component schemas.
 *
 * This file exists purely to register reusable `components.schemas` via
 * Nitro's `$global` mechanism. The handler is a no-op — the route won't
 * appear in docs because it has no `tags` or `summary`.
 */
defineRouteMeta({
  openAPI: {
    $global: {
      components: {
        schemas: {
          ExerciseSet: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'cm5abc123set01' },
              programExerciseId: { type: 'string', example: 'cm5abc123ex01' },
              setNumber: { type: 'integer', example: 1 },
              reps: { type: 'integer', nullable: true, example: 8 },
              weight: { type: 'number', nullable: true, example: 185.0 },
              rpe: { type: 'number', nullable: true, example: 8.5 },
              notes: { type: 'string', nullable: true, example: '75% of working weight' },
            },
          },
          ProgramExercise: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'cm5abc123ex01' },
              exerciseGroupId: { type: 'string', example: 'cm5abc123grp01' },
              name: { type: 'string', example: 'Barbell Back Squat' },
              order: { type: 'integer', example: 1 },
              sets: {
                type: 'array',
                items: { $ref: '#/components/schemas/ExerciseSet' },
              },
            },
          },
          ExerciseGroup: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'cm5abc123grp01' },
              programDayId: { type: 'string', example: 'cm5abc123day01' },
              order: { type: 'integer', example: 1 },
              type: { type: 'string', enum: ['STANDARD', 'SUPERSET'], example: 'STANDARD' },
              restSeconds: { type: 'integer', nullable: true, example: 90 },
              exercises: {
                type: 'array',
                items: { $ref: '#/components/schemas/ProgramExercise' },
              },
            },
          },
          ProgramDay: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'cm5abc123day01' },
              programWeekId: { type: 'string', example: 'cm5abc123week01' },
              dayNumber: { type: 'integer', example: 1 },
              name: { type: 'string', nullable: true, example: 'Lower Body' },
              warmUp: { type: 'string', nullable: true, example: '5 min bike + dynamic stretches' },
              exerciseGroups: {
                type: 'array',
                items: { $ref: '#/components/schemas/ExerciseGroup' },
              },
            },
          },
          ProgramWeek: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'cm5abc123week01' },
              programId: { type: 'string', example: 'cm5abc123prog01' },
              weekNumber: { type: 'integer', example: 1 },
              days: {
                type: 'array',
                items: { $ref: '#/components/schemas/ProgramDay' },
              },
            },
          },
          ProgramDetail: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'cm5abc123prog01' },
              name: { type: 'string', example: 'Brick House' },
              description: { type: 'string', nullable: true, example: 'A 4-week, 5-day/week strength program by Pen and Paper Strength App, LLC.' },
              createdAt: { type: 'string', format: 'date-time', example: '2026-01-15T12:00:00.000Z' },
              weeks: {
                type: 'array',
                items: { $ref: '#/components/schemas/ProgramWeek' },
              },
            },
          },
          ProgramSummary: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'cm5abc123prog01' },
              name: { type: 'string', example: 'Brick House' },
              description: { type: 'string', nullable: true, example: 'A 4-week, 5-day/week strength program by Pen and Paper Strength App, LLC.' },
              createdAt: { type: 'string', format: 'date-time', example: '2026-01-15T12:00:00.000Z' },
              _count: {
                type: 'object',
                properties: {
                  weeks: { type: 'integer', example: 4 },
                },
              },
            },
          },
        },
      },
    },
  },
})

export default defineEventHandler(() => null)
