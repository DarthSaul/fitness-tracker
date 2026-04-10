-- Enable RLS on tables reported as missing it by Supabase database linter.
-- These statements are idempotent — safe to run even if RLS is already enabled.

ALTER TABLE "ScheduledWorkout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Feedback" ENABLE ROW LEVEL SECURITY;
