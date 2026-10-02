-- Social: usernames and bios (docs/social/SPEC-usernames.md). Expand step.
--
-- Additive only: nullable columns that code deployed before this change never
-- selects, so it is safe to apply to the shared database ahead of the deploy.
-- The next migration backfills usernames; a later one sets NOT NULL once the
-- code that generates usernames at sign-up is live.
--
-- Down path (Prisma has no down migrations; run by hand to revert):
--   ALTER TABLE "User" DROP CONSTRAINT "User_username_format_check",
--     DROP CONSTRAINT "User_bio_length_check", DROP COLUMN "username", DROP COLUMN "bio";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261002120000_user_usernames';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- The same rules the API enforces (server/utils/usernames.ts): 3–30 of a–z,
-- 0–9, "_" and "." — lowercase only, so the unique index is case-insensitive
-- in effect — with no leading, trailing or consecutive periods.
ALTER TABLE "User" ADD CONSTRAINT "User_username_format_check" CHECK (
  "username" IS NULL OR ("username" ~ '^[a-z0-9_.]{3,30}$' AND "username" !~ '(^\.|\.$|\.\.)')
);

-- Bio: at most 100 characters (characters, not bytes, matching the API).
ALTER TABLE "User" ADD CONSTRAINT "User_bio_length_check" CHECK ("bio" IS NULL OR char_length("bio") <= 100);
