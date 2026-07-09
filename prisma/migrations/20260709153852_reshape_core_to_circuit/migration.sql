/*
  Warnings:

  - You are about to drop the column `coreSectionAddedAt` on the `WorkoutSession` table. All the data in the column will be lost.
  - You are about to drop the `CompletedCoreSet` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CompletedCoreSet" DROP CONSTRAINT "CompletedCoreSet_exerciseId_fkey";

-- DropForeignKey
ALTER TABLE "CompletedCoreSet" DROP CONSTRAINT "CompletedCoreSet_workoutSessionId_fkey";

-- AlterTable
ALTER TABLE "WorkoutSession" DROP COLUMN "coreSectionAddedAt";

-- DropTable
DROP TABLE "CompletedCoreSet";

-- CreateTable
CREATE TABLE "CoreWorkout" (
    "id" TEXT NOT NULL,
    "workoutSessionId" TEXT NOT NULL,
    "timeSeconds" INTEGER NOT NULL,
    "restSeconds" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoreWorkout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoreWorkoutExercise" (
    "id" TEXT NOT NULL,
    "coreWorkoutId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "CoreWorkoutExercise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoreWorkout_workoutSessionId_key" ON "CoreWorkout"("workoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "CoreWorkoutExercise_coreWorkoutId_order_key" ON "CoreWorkoutExercise"("coreWorkoutId", "order");

-- AddForeignKey
ALTER TABLE "CoreWorkout" ADD CONSTRAINT "CoreWorkout_workoutSessionId_fkey" FOREIGN KEY ("workoutSessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoreWorkoutExercise" ADD CONSTRAINT "CoreWorkoutExercise_coreWorkoutId_fkey" FOREIGN KEY ("coreWorkoutId") REFERENCES "CoreWorkout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoreWorkoutExercise" ADD CONSTRAINT "CoreWorkoutExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Block direct PostgREST access (repo convention: every table gets RLS, no policies)
ALTER TABLE "CoreWorkout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CoreWorkoutExercise" ENABLE ROW LEVEL SECURITY;

-- DB-level guarantees mirroring the API rules: whole-second work interval > 0,
-- rest interval >= 0, exercise order starts at 1
ALTER TABLE "CoreWorkout"
  ADD CONSTRAINT "CoreWorkout_time_positive" CHECK ("timeSeconds" > 0);
ALTER TABLE "CoreWorkout"
  ADD CONSTRAINT "CoreWorkout_rest_non_negative" CHECK ("restSeconds" >= 0);
ALTER TABLE "CoreWorkoutExercise"
  ADD CONSTRAINT "CoreWorkoutExercise_order_positive" CHECK ("order" >= 1);
