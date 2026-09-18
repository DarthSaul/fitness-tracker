-- Each UserProgram row becomes one RUN through a program, so a user can finish
-- a program and start it again from week one with a clean slate. Previously a
-- row was unique per (userId, programId): completion only flipped "isActive"
-- off and left currentWeek/currentDay on the final day, so re-activating
-- resumed the finished run and looped on its last day.
--
-- Expand/contract: the production deploy of `main` shares this database. Code
-- deployed before this change ignores the two new nullable columns, still gets
-- P2002 -> 409 when saving a program that has an open row (via the partial
-- index below), and its activate route keeps resuming completed rows — the
-- existing bug, no worse. The CHECK that forbids an active terminal row would
-- turn that old activate into a 500, so it ships in a follow-up migration once
-- the new deploy is live.

-- AlterTable
ALTER TABLE "UserProgram" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- Backfill completed runs. A run is complete when its position pointer sits on
-- the program's final day and a COMPLETED session exists there: complete.patch
-- only leaves the pointer on the final day when it took the programCompleted
-- branch. "Final day" joins through ProgramDay so empty trailing weeks are
-- ignored, matching the forward scan in complete.patch. No "isActive" filter:
-- users who already re-activated a finished run must be caught too. MIN picks
-- the real completion over any duplicate final-day sessions the bug produced;
-- COALESCE covers sessions completed with a null completedAt.
WITH final_pos AS (
  SELECT DISTINCT ON (pw."programId") pw."programId", pw."weekNumber", pd."dayNumber"
  FROM "ProgramWeek" pw
  JOIN "ProgramDay" pd ON pd."programWeekId" = pw."id"
  ORDER BY pw."programId", pw."weekNumber" DESC, pd."dayNumber" DESC
),
done AS (
  SELECT up."id", MIN(COALESCE(ws."completedAt", ws."startedAt")) AS "at"
  FROM "UserProgram" up
  JOIN final_pos fp ON fp."programId" = up."programId"
    AND fp."weekNumber" = up."currentWeek"
    AND fp."dayNumber" = up."currentDay"
  JOIN "WorkoutSession" ws ON ws."userProgramId" = up."id"
    AND ws."weekNumber" = fp."weekNumber"
    AND ws."dayNumber" = fp."dayNumber"
    AND ws."status" = 'COMPLETED'
  WHERE up."completedAt" IS NULL
  GROUP BY up."id"
)
UPDATE "UserProgram" up
SET "completedAt" = done."at", "isActive" = false
FROM done
WHERE up."id" = done."id";

-- Conservative cleanup of the bug's by-product: on a completed run, sessions at
-- the final position other than the earliest COMPLETED one, and only when they
-- hold no logged data. A duplicate with sets or a core workout is real history
-- and stays.
WITH final_pos AS (
  SELECT DISTINCT ON (pw."programId") pw."programId", pw."weekNumber", pd."dayNumber"
  FROM "ProgramWeek" pw
  JOIN "ProgramDay" pd ON pd."programWeekId" = pw."id"
  ORDER BY pw."programId", pw."weekNumber" DESC, pd."dayNumber" DESC
),
ranked AS (
  SELECT ws."id",
         ROW_NUMBER() OVER (
           PARTITION BY ws."userProgramId"
           ORDER BY (ws."status" = 'COMPLETED') DESC,
                    COALESCE(ws."completedAt", ws."startedAt") ASC,
                    ws."startedAt" ASC
         ) AS rn
  FROM "WorkoutSession" ws
  JOIN "UserProgram" up ON up."id" = ws."userProgramId" AND up."completedAt" IS NOT NULL
  JOIN final_pos fp ON fp."programId" = up."programId"
    AND fp."weekNumber" = ws."weekNumber"
    AND fp."dayNumber" = ws."dayNumber"
)
DELETE FROM "WorkoutSession" ws
USING ranked r
WHERE ws."id" = r."id"
  AND r.rn > 1
  AND NOT EXISTS (SELECT 1 FROM "CompletedSet" cs WHERE cs."workoutSessionId" = ws."id")
  AND NOT EXISTS (SELECT 1 FROM "CoreWorkout" cw WHERE cw."workoutSessionId" = ws."id");

-- At most one OPEN run per (user, program). Created before the old unique is
-- dropped so there is no window without a guard. Not expressible in Prisma —
-- see the header comment in schema.prisma.
CREATE UNIQUE INDEX "UserProgram_userId_programId_open_partial_idx"
  ON "UserProgram" ("userId", "programId")
  WHERE "completedAt" IS NULL AND "archivedAt" IS NULL;

-- DropIndex
DROP INDEX "UserProgram_userId_programId_key";

-- CreateIndex
CREATE INDEX "UserProgram_userId_programId_idx" ON "UserProgram"("userId", "programId");
