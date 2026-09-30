-- Social: friendships (docs/social/SPEC-friendships.md).
--
-- Additive only: a new enum and table that code deployed before this change
-- never reads, so it is safe to apply to the shared database ahead of the deploy.

-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "userLowId" TEXT NOT NULL,
    "userHighId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Friendship_userHighId_status_idx" ON "Friendship"("userHighId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_userLowId_userHighId_key" ON "Friendship"("userLowId", "userHighId");

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userLowId_fkey" FOREIGN KEY ("userLowId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userHighId_fkey" FOREIGN KEY ("userHighId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The pair is stored sorted so the unique index above covers both directions.
-- COLLATE "C" compares bytes, matching JavaScript's `<` on the ASCII cuid ids
-- that orderedPair() sorts with — the database's default collation might not.
-- Strict `<` also rules out a self-friendship.
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_pair_ordered_check" CHECK ("userLowId" < "userHighId" COLLATE "C");

-- The requester must be one of the pair.
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_requester_in_pair_check" CHECK ("requesterId" IN ("userLowId", "userHighId"));
