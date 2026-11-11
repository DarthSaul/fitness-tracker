-- AlterTable
ALTER TABLE "ScheduledWorkout" ADD COLUMN     "standaloneWorkoutId" TEXT,
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "userProgramId" DROP NOT NULL,
ALTER COLUMN "weekNumber" DROP NOT NULL,
ALTER COLUMN "dayNumber" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ScheduledWorkout_userId_scheduledDate_idx" ON "ScheduledWorkout"("userId", "scheduledDate");

-- CreateIndex
CREATE INDEX "ScheduledWorkout_standaloneWorkoutId_idx" ON "ScheduledWorkout"("standaloneWorkoutId");

-- AddForeignKey
ALTER TABLE "ScheduledWorkout" ADD CONSTRAINT "ScheduledWorkout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledWorkout" ADD CONSTRAINT "ScheduledWorkout_standaloneWorkoutId_fkey" FOREIGN KEY ("standaloneWorkoutId") REFERENCES "StandaloneWorkout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill the owner of every existing program row. Expand step only:
-- production's previous client keeps inserting program rows without userId,
-- so the contract migration re-runs this before setting NOT NULL.
UPDATE "ScheduledWorkout" sw
SET "userId" = up."userId"
FROM "UserProgram" up
WHERE up."id" = sw."userProgramId"
  AND sw."userId" IS NULL;

-- Raw CHECK (Prisma can't express it): a row is a program day or a
-- standalone workout, never both or neither. userId is required on the
-- standalone kind only, for the reason above.
ALTER TABLE "ScheduledWorkout" ADD CONSTRAINT "ScheduledWorkout_one_kind" CHECK (
  ("userProgramId" IS NOT NULL AND "weekNumber" IS NOT NULL AND "dayNumber" IS NOT NULL
    AND "standaloneWorkoutId" IS NULL)
  OR
  ("standaloneWorkoutId" IS NOT NULL AND "userId" IS NOT NULL
    AND "userProgramId" IS NULL AND "weekNumber" IS NULL AND "dayNumber" IS NULL)
);

-- One standalone workout per user per date. Program rows keep their per-run
-- @@unique constraints, so a program day and a standalone can share a date.
CREATE UNIQUE INDEX "ScheduledWorkout_userId_scheduledDate_standalone_partial_idx"
ON "ScheduledWorkout" ("userId", "scheduledDate")
WHERE "standaloneWorkoutId" IS NOT NULL;
