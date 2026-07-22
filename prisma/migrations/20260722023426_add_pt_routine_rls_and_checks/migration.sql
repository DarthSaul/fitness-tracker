-- Enable RLS on the new PT routine tables. No policies are added: the app
-- connects as the postgres role which bypasses RLS; this blocks Supabase
-- PostgREST access, matching every other table in the schema.
ALTER TABLE "PtRoutine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PtRoutineExercise" ENABLE ROW LEVEL SECURITY;

-- Back up the app-layer validation contract at the DB level:
-- exactly one measure per exercise, bounded values, 1-based ordering.
ALTER TABLE "PtRoutineExercise"
  ADD CONSTRAINT "PtRoutineExercise_exactly_one_measure"
  CHECK (("durationSeconds" IS NULL) <> ("reps" IS NULL));

ALTER TABLE "PtRoutineExercise"
  ADD CONSTRAINT "PtRoutineExercise_duration_bounds"
  CHECK ("durationSeconds" IS NULL OR ("durationSeconds" BETWEEN 1 AND 3600));

ALTER TABLE "PtRoutineExercise"
  ADD CONSTRAINT "PtRoutineExercise_reps_bounds"
  CHECK ("reps" IS NULL OR ("reps" BETWEEN 1 AND 1000));

ALTER TABLE "PtRoutineExercise"
  ADD CONSTRAINT "PtRoutineExercise_order_positive"
  CHECK ("order" >= 1);
