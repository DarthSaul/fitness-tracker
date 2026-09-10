-- Contract step for the private-bucket change. 20260910143000_exercise_media_paths
-- copied the object keys into "animationPath"/"posterPath" and cleared these
-- URL columns; nothing on this branch reads them any more.
--
-- Known, accepted window (2026-09-10): production code deployed before this
-- branch still selects "animationUrl" through `exercise: true` includes, so
-- GET /api/standalone-workouts/:id returns 500 there from the moment this is
-- applied until the branch is merged and deployed. Merge promptly after applying.

-- AlterTable
ALTER TABLE "Exercise" DROP COLUMN "animationUrl",
DROP COLUMN "posterUrl";
