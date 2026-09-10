-- Exercise demo media moves from public URLs to object keys in a PRIVATE
-- Storage bucket. The API signs a key on every read
-- (server/utils/exercise-media.ts), so a stored value is no longer a link.
--
-- Expand/contract, not a rename: production code deployed before this change
-- still selects "animationUrl"/"posterUrl" (via `exercise: true` includes), so
-- dropping or renaming them here would 500 live routes until the new code
-- ships. The old columns stay, are cleared below, and are dropped by a later
-- migration once the new deploy is everywhere (see CLAUDE.md Backlog).

-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "animationPath" TEXT,
ADD COLUMN     "posterPath" TEXT;

-- Backfill the five rows attached on 2026-09-08: they hold full public-object
-- URLs; keep only the bucket-relative key (exercises/<slug>/<token>/demo.mp4).
UPDATE "Exercise"
SET    "animationPath" = regexp_replace("animationUrl", '^https?://[^/]+/storage/v1/object/public/exercise-media/', '')
WHERE  "animationUrl" IS NOT NULL;

UPDATE "Exercise"
SET    "posterPath" = regexp_replace("posterUrl", '^https?://[^/]+/storage/v1/object/public/exercise-media/', '')
WHERE  "posterUrl" IS NOT NULL;

-- The public URLs stop resolving the moment the bucket goes private. Clear
-- them so any code still reading these columns returns null, not a dead link.
UPDATE "Exercise"
SET    "animationUrl" = NULL,
       "posterUrl" = NULL
WHERE  "animationUrl" IS NOT NULL OR "posterUrl" IS NOT NULL;
