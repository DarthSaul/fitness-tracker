-- Complete duplicate IN_PROGRESS sessions, keeping the earliest (smallest id)
UPDATE "WorkoutSession"
SET "status" = 'COMPLETED'
WHERE "status" = 'IN_PROGRESS'
  AND id NOT IN (
    SELECT MIN(id) FROM "WorkoutSession"
    WHERE "status" = 'IN_PROGRESS'
    GROUP BY "userProgramId"
  );

-- Partial unique index to enforce one IN_PROGRESS session per userProgram.
-- Mirrors the UserProgram partial index pattern.
CREATE UNIQUE INDEX "WorkoutSession_userProgramId_in_progress_partial_idx"
  ON "WorkoutSession" ("userProgramId")
  WHERE "status" = 'IN_PROGRESS';
