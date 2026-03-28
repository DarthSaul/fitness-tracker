import { findNextActiveExercise } from '~/app/utils/workout'

describe('findNextActiveExercise', () => {
  test('returns name of first exercise that has at least one incomplete set', () => {
    const workout = {
      session: {
        completedSets: [{ exerciseSetId: 'set-a1' }],
      },
      day: {
        exerciseGroups: [
          {
            exercises: [
              {
                exercise: { name: 'Bench Press' },
                sets: [{ id: 'set-a1' }, { id: 'set-a2' }],
              },
              {
                exercise: { name: 'Barbell Row' },
                sets: [{ id: 'set-b1' }],
              },
            ],
          },
        ],
      },
    }
    // set-a1 is complete but set-a2 is not — Bench Press is still in progress
    expect(findNextActiveExercise(workout as any)).toBe('Bench Press')
  })

  test('returns null when all sets across all exercises are completed', () => {
    const workout = {
      session: {
        completedSets: [
          { exerciseSetId: 'set-a1' },
          { exerciseSetId: 'set-b1' },
        ],
      },
      day: {
        exerciseGroups: [
          {
            exercises: [
              {
                exercise: { name: 'Bench Press' },
                sets: [{ id: 'set-a1' }],
              },
              {
                exercise: { name: 'Barbell Row' },
                sets: [{ id: 'set-b1' }],
              },
            ],
          },
        ],
      },
    }
    expect(findNextActiveExercise(workout as any)).toBeNull()
  })
})
