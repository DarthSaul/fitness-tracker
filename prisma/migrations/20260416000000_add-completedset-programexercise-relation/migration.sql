-- AddForeignKey
ALTER TABLE "CompletedSet" ADD CONSTRAINT "CompletedSet_programExerciseId_fkey" FOREIGN KEY ("programExerciseId") REFERENCES "ProgramExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "CompletedSet_workoutSessionId_programExerciseId_key" ON "CompletedSet"("workoutSessionId", "programExerciseId");

-- CreateIndex: index on programExerciseId for FK lookup performance
CREATE INDEX "CompletedSet_programExerciseId_idx" ON "CompletedSet"("programExerciseId");

-- Check constraint: exactly one of exerciseSetId or programExerciseId must be non-null
-- (This enforces the discriminated union pattern — a set is either a template set or an extra/swapped set, not both and not neither)
ALTER TABLE "CompletedSet" ADD CONSTRAINT "CompletedSet_one_discriminator" CHECK (("exerciseSetId" IS NOT NULL)::int + ("programExerciseId" IS NOT NULL)::int = 1);
