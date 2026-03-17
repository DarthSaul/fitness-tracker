-- Partial unique index to enforce one IN_PROGRESS session per userProgram.
-- Mirrors the UserProgram partial index pattern.
CREATE UNIQUE INDEX "WorkoutSession_userProgramId_in_progress_partial_idx"
  ON "WorkoutSession" ("userProgramId")
  WHERE "status" = 'IN_PROGRESS';
