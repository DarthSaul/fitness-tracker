-- Social: give every existing user a generated username
-- (docs/social/SPEC-usernames.md, "Generation scheme").
--
-- Each user without one gets "user_" + 6 random digits, the same scheme
-- generateUsername() uses at sign-up, oldest account first. A candidate that
-- is already taken raises unique_violation and is retried with new digits.
--
-- Idempotent (only rows WHERE "username" IS NULL), so the later NOT NULL
-- migration re-runs this same block first to cover anyone who signed up
-- between this backfill and the deploy that generates usernames at sign-up.
--
-- Down path: none needed — usernames can be cleared by hand
-- (UPDATE "User" SET "username" = NULL) before reverting the previous migration.

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
