-- AlterTable
-- Added nullable first so the 88 existing rows can be backfilled before the
-- NOT NULL constraint lands; Prisma's default "ADD COLUMN ... NOT NULL" would
-- fail on a populated table.
ALTER TABLE "Exercise" ADD COLUMN     "slug" TEXT;

-- Backfill: derive from name. Mirrors slugify() in shared/utils/slug.ts —
-- lowercase, drop apostrophes, collapse non-alphanumeric runs to one hyphen,
-- trim leading/trailing hyphens. Verified against the live catalog before
-- apply: 88 names -> 88 distinct slugs. The seed re-derives slug on every
-- upsert, so this expression only ever needs to run once.
UPDATE "Exercise"
SET    "slug" = trim(both '-' from regexp_replace(regexp_replace(lower("name"), '[''’]', '', 'g'), '[^a-z0-9]+', '-', 'g'))
WHERE  "slug" IS NULL;

-- Every row now has a value; enforce it going forward.
ALTER TABLE "Exercise" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_slug_key" ON "Exercise"("slug");
