-- AlterTable
ALTER TABLE "User" ADD COLUMN     "ptRoutineInWorkout" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PtRoutine" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PtRoutine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PtRoutineExercise" (
    "id" TEXT NOT NULL,
    "ptRoutineId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "reps" INTEGER,

    CONSTRAINT "PtRoutineExercise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PtRoutine_userId_idx" ON "PtRoutine"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PtRoutineExercise_ptRoutineId_order_key" ON "PtRoutineExercise"("ptRoutineId", "order");

-- AddForeignKey
ALTER TABLE "PtRoutine" ADD CONSTRAINT "PtRoutine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PtRoutineExercise" ADD CONSTRAINT "PtRoutineExercise_ptRoutineId_fkey" FOREIGN KEY ("ptRoutineId") REFERENCES "PtRoutine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
