-- CreateTable: Identity — one row per (provider, providerId) pair, many per User
CREATE TABLE "Identity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Identity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Identity_provider_providerId_key" ON "Identity"("provider", "providerId");

-- CreateIndex
CREATE INDEX "Identity_userId_idx" ON "Identity"("userId");

-- AddForeignKey
ALTER TABLE "Identity" ADD CONSTRAINT "Identity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: copy each existing User's provider + providerId into Identity BEFORE dropping those columns.
-- gen_random_uuid() is built in on PG 13+ (Supabase runs PG 15).
-- We prefix with 'c' so the id superficially resembles a cuid, though format isn't enforced.
INSERT INTO "Identity" ("id", "userId", "provider", "providerId", "createdAt")
SELECT
    'c' || replace(gen_random_uuid()::text, '-', ''),
    "id",
    "provider",
    "providerId",
    "createdAt"
FROM "User";

-- DropIndex: composite unique on User
DROP INDEX "User_provider_providerId_key";

-- AlterTable: remove provider + providerId columns from User
ALTER TABLE "User" DROP COLUMN "provider";
ALTER TABLE "User" DROP COLUMN "providerId";
