-- Partial unique index to enforce that a user can only have one active program at a time.
-- This cannot be expressed in Prisma schema syntax (@@unique would block multiple inactive programs).
CREATE UNIQUE INDEX "UserProgram_userId_isActive_partial_idx"
  ON "UserProgram" ("userId")
  WHERE "isActive" = true;
