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
-- Idempotent: only enable RLS on _prisma_migrations if the table exists.
-- The shadow database used by `prisma migrate dev` does not have this table.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = '_prisma_migrations') THEN
    EXECUTE 'ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY';
  END IF;
END
$$;
