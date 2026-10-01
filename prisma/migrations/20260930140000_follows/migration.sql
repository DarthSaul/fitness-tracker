-- Social pivot: friends → follows, post-level → profile-level privacy
-- (docs/social/SPEC-follows.md).
--
-- EXPAND only. Adds the follow model and User.profileVisibility. It drops
-- nothing: production still runs the #133/#134 code, which reads "Friendship"
-- and "Post"."visibility", so those stay until this deploy is live. The
-- separate `friendships-removal` migration drops them afterwards.
--
-- ADD COLUMN ... NOT NULL DEFAULT is metadata-only on Postgres 11+ (no table
-- rewrite), and existing users take the default: PRIVATE, per the decision to
-- default every profile to private.
--
-- Down path (Prisma has no down migrations; run by hand to revert):
--   DROP TABLE "Follow";
--   ALTER TABLE "User" DROP COLUMN "profileVisibility";
--   DROP TYPE "FollowStatus";
--   DROP TYPE "ProfileVisibility";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20260930140000_follows';

-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "FollowStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "profileVisibility" "ProfileVisibility" NOT NULL DEFAULT 'PRIVATE';

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followeeId" TEXT NOT NULL,
    "status" "FollowStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Follow_followeeId_status_idx" ON "Follow"("followeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerId_followeeId_key" ON "Follow"("followerId", "followeeId");

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followeeId_fkey" FOREIGN KEY ("followeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A user cannot follow themselves (Prisma cannot express CHECK constraints).
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_not_self_check" CHECK ("followerId" <> "followeeId");
