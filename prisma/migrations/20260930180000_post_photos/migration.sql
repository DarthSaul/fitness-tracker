-- Social: post photos (docs/social/SPEC-post-photos.md).
--
-- Additive only: a new table that code deployed before this change never
-- reads, so it is safe to apply to the shared database ahead of the deploy.
-- The bytes live in the PRIVATE `post-photos` Storage bucket, which is created
-- separately (it is not part of the database schema).
--
-- (postId, position) is unique, and Postgres treats NULLs as distinct, so any
-- number of not-yet-attached uploads (both NULL) can coexist.
--
-- Down path (Prisma has no down migrations; run by hand to revert):
--   DROP TABLE "PostPhoto";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20260930180000_post_photos';

-- CreateTable
CREATE TABLE "PostPhoto" (
    "id" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "postId" TEXT,
    "position" INTEGER,
    "storagePath" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostPhoto_storagePath_key" ON "PostPhoto"("storagePath");

-- CreateIndex
CREATE INDEX "PostPhoto_uploaderId_postId_idx" ON "PostPhoto"("uploaderId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "PostPhoto_postId_position_key" ON "PostPhoto"("postId", "position");

-- AddForeignKey
ALTER TABLE "PostPhoto" ADD CONSTRAINT "PostPhoto_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostPhoto" ADD CONSTRAINT "PostPhoto_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Attached ⇔ positioned, and at most 4 per post (positions 0–3).
-- "position" IS NOT NULL is explicit: a CHECK only rejects FALSE, and
-- `NULL BETWEEN 0 AND 3` is NULL, so without it an attached row with no
-- position would pass (PR #138 review).
ALTER TABLE "PostPhoto" ADD CONSTRAINT "PostPhoto_attach_position_check" CHECK (
  ("postId" IS NULL AND "position" IS NULL) OR
  ("postId" IS NOT NULL AND "position" IS NOT NULL AND "position" BETWEEN 0 AND 3)
);
