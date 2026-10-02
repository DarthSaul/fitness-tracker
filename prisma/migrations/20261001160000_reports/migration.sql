-- Social: reports of posts and users, kept for moderation
-- (docs/social/SPEC-reports.md).
--
-- Additive only: a new enum and table that code deployed before this change
-- never reads, so it is safe to apply to the shared database ahead of the
-- deploy. Apply BEFORE merging: POST /api/reports writes "Report".
--
-- Down path (Prisma has no down migrations; run by hand to revert):
--   DROP TABLE "Report";
--   DROP TYPE "ReportReason";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261001160000_reports';

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'HATE', 'SEXUAL_CONTENT', 'VIOLENCE', 'SELF_HARM', 'IMPERSONATION', 'OTHER');

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "postId" TEXT,
    "isPostReport" BOOLEAN NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Report_resolvedAt_createdAt_idx" ON "Report"("resolvedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Report_reportedUserId_idx" ON "Report"("reportedUserId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One report per reporter per target, so a repeat is a no-op (the route
-- returns the existing report, including after a concurrent P2002). A post
-- report whose post was deleted (postId nulled) leaves the first index; it
-- can't be re-reported anyway, since the post is gone.
CREATE UNIQUE INDEX "Report_reporterId_postId_key" ON "Report"("reporterId", "postId") WHERE "postId" IS NOT NULL;
CREATE UNIQUE INDEX "Report_reporterId_reportedUserId_user_key" ON "Report"("reporterId", "reportedUserId") WHERE NOT "isPostReport";

-- Nobody reports themselves or their own post; a post id only on a post report.
ALTER TABLE "Report" ADD CONSTRAINT "Report_not_self_check" CHECK ("reporterId" <> "reportedUserId");
ALTER TABLE "Report" ADD CONSTRAINT "Report_post_kind_check" CHECK ("postId" IS NULL OR "isPostReport");

-- Defence in depth for the free text: the route caps details at 1,000
-- characters (4 bytes max each); resolution is written by hand, capped generously.
ALTER TABLE "Report" ADD CONSTRAINT "Report_details_length_check" CHECK ("details" IS NULL OR octet_length("details") <= 4000);
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolution_length_check" CHECK ("resolution" IS NULL OR octet_length("resolution") <= 16000);
