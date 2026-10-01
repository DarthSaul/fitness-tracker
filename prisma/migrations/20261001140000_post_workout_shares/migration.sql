-- Social: a post may share one of its author's completed workouts
-- (docs/social/SPEC-workout-shares.md).
--
-- Additive only: nullable columns that code deployed before this change never
-- selects, so it is safe to apply to the shared database ahead of the deploy.
-- Apply BEFORE merging: the new code selects these columns on every post route.
--
-- Down path (Prisma has no down migrations; run by hand to revert):
--   ALTER TABLE "Post" DROP CONSTRAINT "Post_workout_share_check",
--     DROP COLUMN "sharedProgramName", DROP COLUMN "sharedWorkoutKind",
--     DROP COLUMN "standaloneSessionId", DROP COLUMN "workoutSessionId";
--   DROP TYPE "WorkoutShareKind";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261001140000_post_workout_shares';

-- CreateEnum
CREATE TYPE "WorkoutShareKind" AS ENUM ('PROGRAM', 'STANDALONE');

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "sharedProgramName" TEXT,
ADD COLUMN     "sharedWorkoutKind" "WorkoutShareKind",
ADD COLUMN     "standaloneSessionId" TEXT,
ADD COLUMN     "workoutSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Post_workoutSessionId_key" ON "Post"("workoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Post_standaloneSessionId_key" ON "Post"("standaloneSessionId");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_workoutSessionId_fkey" FOREIGN KEY ("workoutSessionId") REFERENCES "WorkoutSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_standaloneSessionId_fkey" FOREIGN KEY ("standaloneSessionId") REFERENCES "StandaloneWorkoutSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- No half shares. The session ids may be null in a shared row (the session
-- was deleted; ON DELETE SET NULL), but never the wrong kind's, and the
-- program name exists exactly for PROGRAM shares. Every branch is a definite
-- boolean (IS [NOT] NULL), and a NULL kind falls through to ELSE.
ALTER TABLE "Post" ADD CONSTRAINT "Post_workout_share_check" CHECK (
  CASE "sharedWorkoutKind"
    WHEN 'PROGRAM' THEN "sharedProgramName" IS NOT NULL AND "standaloneSessionId" IS NULL
    WHEN 'STANDALONE' THEN "sharedProgramName" IS NULL AND "workoutSessionId" IS NULL
    ELSE "sharedProgramName" IS NULL AND "workoutSessionId" IS NULL AND "standaloneSessionId" IS NULL
  END
);
