-- Social: post reactions (docs/social/SPEC-reactions.md).
--
-- Additive only: a new table that code deployed before this change never
-- reads, so it is safe to apply to the shared database ahead of the deploy.
-- Apply BEFORE merging: the new code reads "PostReaction" on every post route.
--
-- Down path (Prisma has no down migrations; run by hand to revert):
--   DROP TABLE "PostReaction";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261001120000_post_reactions';

-- CreateTable
CREATE TABLE "PostReaction" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostReaction_postId_emoji_createdAt_id_idx" ON "PostReaction"("postId", "emoji", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PostReaction_postId_userId_emoji_key" ON "PostReaction"("postId", "userId", "emoji");

-- AddForeignKey
ALTER TABLE "PostReaction" ADD CONSTRAINT "PostReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostReaction" ADD CONSTRAINT "PostReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defence in depth: the route only stores a single validated emoji (the
-- longest RGI emoji is ~40 bytes), so a bypass can't park arbitrary text here.
ALTER TABLE "PostReaction" ADD CONSTRAINT "PostReaction_emoji_length_check" CHECK (octet_length("emoji") BETWEEN 1 AND 64);
