-- Social: CONTRACT step of the friends → follows pivot (docs/social/SPEC-friendships-removal.md).
--
-- Drops what 20260930140000_follows deliberately kept: "Friendship",
-- "FriendshipStatus", "Post"."visibility" and "PostVisibility". It runs only
-- once the code that stopped using them (#135, 8fff1a4) is the live
-- production deployment, which was confirmed on Vercel on 2026-09-30.
--
-- Consequence: an instant rollback of production to #134 or earlier would
-- fail, because that code reads these objects. Rolling back to #135 or later
-- is unaffected.
--
-- Down path (Prisma has no down migrations; run by hand to revert). This
-- recreates the empty objects as 20260929130000_friendships and
-- 20260930120000_posts defined them:
--   CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED');
--   CREATE TYPE "PostVisibility" AS ENUM ('PUBLIC', 'FRIENDS');
--   ALTER TABLE "Post" ADD COLUMN "visibility" "PostVisibility" NOT NULL DEFAULT 'FRIENDS';
--   -- then re-run the CREATE TABLE / indexes / FKs / CHECKs from
--   -- prisma/migrations/20260929130000_friendships/migration.sql
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20260930160000_drop_friendships';

-- Safety guard: "Friendship" had 0 rows when this was written, and nothing has
-- written to it since #135. If that has changed, stop here instead of
-- destroying data. (Post.visibility is unread and only ever held the default,
-- so dropping it loses nothing.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Friendship") THEN
    RAISE EXCEPTION 'Refusing to drop "Friendship": it contains rows. Investigate before re-running.';
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "Friendship" DROP CONSTRAINT "Friendship_userLowId_fkey";

-- DropForeignKey
ALTER TABLE "Friendship" DROP CONSTRAINT "Friendship_userHighId_fkey";

-- AlterTable
ALTER TABLE "Post" DROP COLUMN "visibility";

-- DropTable
DROP TABLE "Friendship";

-- DropEnum
DROP TYPE "FriendshipStatus";

-- DropEnum
DROP TYPE "PostVisibility";
