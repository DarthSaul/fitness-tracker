-- Complete duplicate IN_PROGRESS sessions, keeping the earliest by startedAt
UPDATE "WorkoutSession"
SET "status" = 'COMPLETED'
WHERE "status" = 'IN_PROGRESS'
  AND id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY "userProgramId" ORDER BY "startedAt" ASC
      ) AS rn
      FROM "WorkoutSession"
      WHERE "status" = 'IN_PROGRESS'
    ) sub
    WHERE rn = 1
  );

-- Partial unique index to enforce one IN_PROGRESS session per userProgram.
-- Mirrors the UserProgram partial index pattern.
CREATE UNIQUE INDEX "WorkoutSession_userProgramId_in_progress_partial_idx"
  ON "WorkoutSession" ("userProgramId")
  WHERE "status" = 'IN_PROGRESS';
