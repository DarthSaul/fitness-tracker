-- Enable Row Level Security on all tables to block direct PostgREST access.
-- No permissive policies are created because:
--   1. The app accesses the DB via Prisma using the postgres role (bypasses RLS)
--   2. We want to deny all access through Supabase's auto-generated REST API

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Program" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramWeek" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramDay" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExerciseGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramExercise" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExerciseSet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Exercise" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserProgram" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkoutSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompletedSet" ENABLE ROW LEVEL SECURITY;
-- Note: _prisma_migrations RLS is handled outside of Prisma migrations
-- because this table doesn't exist in the shadow database during migrate dev.
-- Apply manually: ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
