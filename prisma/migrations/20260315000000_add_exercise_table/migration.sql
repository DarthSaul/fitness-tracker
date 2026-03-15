-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_name_key" ON "Exercise"("name");

-- Backfill: insert distinct exercise names from ProgramExercise into Exercise
INSERT INTO "Exercise" ("id", "name")
SELECT gen_random_uuid()::text, DISTINCT_NAMES."name"
FROM (SELECT DISTINCT "name" FROM "ProgramExercise") AS DISTINCT_NAMES;

-- AddColumn: nullable exerciseId on ProgramExercise
ALTER TABLE "ProgramExercise" ADD COLUMN "exerciseId" TEXT;

-- Backfill: set exerciseId from matching Exercise rows
UPDATE "ProgramExercise"
SET "exerciseId" = "Exercise"."id"
FROM "Exercise"
WHERE "ProgramExercise"."name" = "Exercise"."name";

-- MakeNotNull: exerciseId is now required
ALTER TABLE "ProgramExercise" ALTER COLUMN "exerciseId" SET NOT NULL;

-- DropColumn: remove the old name column
ALTER TABLE "ProgramExercise" DROP COLUMN "name";

-- AddForeignKey
ALTER TABLE "ProgramExercise" ADD CONSTRAINT "ProgramExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
