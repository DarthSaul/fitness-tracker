-- CreateEnum
CREATE TYPE "ExerciseGroupType" AS ENUM ('STANDARD', 'SUPERSET');

-- DropForeignKey
ALTER TABLE "ProgramExercise" DROP CONSTRAINT "ProgramExercise_programDayId_fkey";

-- DropIndex
DROP INDEX "ProgramExercise_programDayId_order_key";

-- AlterTable
ALTER TABLE "ProgramDay" ADD COLUMN     "warmUp" TEXT;

-- AlterTable
ALTER TABLE "ProgramExercise" DROP COLUMN "programDayId",
ADD COLUMN     "exerciseGroupId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "ExerciseGroup" (
    "id" TEXT NOT NULL,
    "programDayId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "ExerciseGroupType" NOT NULL DEFAULT 'STANDARD',
    "restSeconds" INTEGER,

    CONSTRAINT "ExerciseGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseGroup_programDayId_order_key" ON "ExerciseGroup"("programDayId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramExercise_exerciseGroupId_order_key" ON "ProgramExercise"("exerciseGroupId", "order");

-- AddForeignKey
ALTER TABLE "ExerciseGroup" ADD CONSTRAINT "ExerciseGroup_programDayId_fkey" FOREIGN KEY ("programDayId") REFERENCES "ProgramDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramExercise" ADD CONSTRAINT "ProgramExercise_exerciseGroupId_fkey" FOREIGN KEY ("exerciseGroupId") REFERENCES "ExerciseGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
