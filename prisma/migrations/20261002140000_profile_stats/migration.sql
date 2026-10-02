-- Social: opt-out profile stats — the active program's name and the completed
-- workout count (docs/social/SPEC-profile-stats.md, ADR 001 amendment).
--
-- Additive only: two booleans with a constant default (a metadata-only change
-- in Postgres 11+, no table rewrite) that code deployed before this change
-- never selects, plus two indexes. Safe to apply ahead of the deploy.
--
-- The indexes are built plainly, not CONCURRENTLY: Prisma Migrate runs each
-- migration in a transaction, where CONCURRENTLY is not allowed, and both
-- session tables are small enough that the brief write lock is harmless.
--
-- Down path (Prisma has no down migrations; run by hand to revert):
--   DROP INDEX "WorkoutSession_userId_status_idx";
--   DROP INDEX "StandaloneWorkoutSession_userId_status_idx";
--   ALTER TABLE "User" DROP COLUMN "showActiveProgram", DROP COLUMN "showWorkoutCount";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261002140000_profile_stats';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "showActiveProgram" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showWorkoutCount" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "WorkoutSession_userId_status_idx" ON "WorkoutSession"("userId", "status");

-- CreateIndex
CREATE INDEX "StandaloneWorkoutSession_userId_status_idx" ON "StandaloneWorkoutSession"("userId", "status");
