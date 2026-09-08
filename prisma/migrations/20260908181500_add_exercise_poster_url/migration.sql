-- AlterTable
-- Still frame for the exercise demo clip. Nullable: only exercises with
-- purchased media get one, attached by scripts/media/attach.ts from
-- media-manifest.json. Additive and safe to apply with rows present.
ALTER TABLE "Exercise" ADD COLUMN     "posterUrl" TEXT;
