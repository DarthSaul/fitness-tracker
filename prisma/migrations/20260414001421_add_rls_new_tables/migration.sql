-- Enable RLS on new tables added in the previous migration.
-- These statements are idempotent — safe to run even if RLS is already enabled.

ALTER TABLE "UserExerciseNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkoutExerciseSwap" ENABLE ROW LEVEL SECURITY;
