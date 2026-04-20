ALTER TABLE "CompletedSet" ADD COLUMN IF NOT EXISTS "adhocExerciseName" TEXT;

-- Update discriminator constraint to permit ad-hoc sets (adhocExerciseName non-null,
-- both exerciseSetId and programExerciseId null)
ALTER TABLE "CompletedSet"
  DROP CONSTRAINT IF EXISTS "CompletedSet_one_discriminator";

ALTER TABLE "CompletedSet"
  ADD CONSTRAINT "CompletedSet_one_discriminator"
  CHECK (
    (("exerciseSetId" IS NOT NULL)::int +
     ("programExerciseId" IS NOT NULL)::int +
     ("adhocExerciseName" IS NOT NULL)::int) = 1
  );
