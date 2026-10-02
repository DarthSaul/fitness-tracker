-- Social: every account has a username — the contract step
-- (docs/social/SPEC-usernames.md, "Generation scheme").
--
-- Safe only once the code that generates a username at sign-up (#144,
-- findOrLinkUser) is live in production — verified before applying: the
-- production deployment is 9346958 (#144). Rolling production back to a
-- pre-#144 deployment after this would make sign-ups fail the NOT NULL.
--
-- Step 1 re-runs the backfill from 20261002120100_backfill_usernames, so
-- anyone who signed up on the old code between that backfill and the #144
-- deploy gets a generated name. It's idempotent (only NULL rows), and is
-- expected to update nothing (0 NULLs on 2026-10-02).
--
-- Down path (Prisma has no down migrations; run by hand to revert):
--   ALTER TABLE "User" ALTER COLUMN "username" DROP NOT NULL;
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261002160000_require_username';

-- Step 1: backfill any stragglers ("user_" + 6 random digits, retried on a collision).
DO $$
DECLARE
  r RECORD;
  candidate TEXT;
BEGIN
  FOR r IN SELECT "id" FROM "User" WHERE "username" IS NULL ORDER BY "createdAt", "id" LOOP
    LOOP
      candidate := 'user_' || lpad(floor(random() * 1000000)::int::text, 6, '0');
      BEGIN
        UPDATE "User" SET "username" = candidate WHERE "id" = r."id";
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- Taken: loop and draw new digits.
      END;
    END LOOP;
  END LOOP;
END $$;

-- Step 2: require it.
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
