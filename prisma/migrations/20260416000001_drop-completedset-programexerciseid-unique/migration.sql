-- Drop unique constraint on (workoutSessionId, programExerciseId) to allow
-- multiple extra sets per exercise per session.
DROP INDEX IF EXISTS "CompletedSet_workoutSessionId_programExerciseId_key";

-- Replace with a non-unique index for query performance.
CREATE INDEX IF NOT EXISTS "CompletedSet_workoutSessionId_programExerciseId_idx"
ON "CompletedSet"("workoutSessionId", "programExerciseId");
