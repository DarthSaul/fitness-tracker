-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "isCore" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN     "coreSectionAddedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CompletedCoreSet" (
    "id" TEXT NOT NULL,
    "workoutSessionId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "reps" INTEGER,
    "notes" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompletedCoreSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompletedCoreSet_workoutSessionId_idx" ON "CompletedCoreSet"("workoutSessionId");

-- AddForeignKey
ALTER TABLE "CompletedCoreSet" ADD CONSTRAINT "CompletedCoreSet_workoutSessionId_fkey" FOREIGN KEY ("workoutSessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletedCoreSet" ADD CONSTRAINT "CompletedCoreSet_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Block direct PostgREST access (repo convention: every table gets RLS, no policies)
ALTER TABLE "CompletedCoreSet" ENABLE ROW LEVEL SECURITY;

-- DB-level guarantee mirroring the API rule: at least one of duration/reps
ALTER TABLE "CompletedCoreSet"
  ADD CONSTRAINT "CompletedCoreSet_duration_or_reps"
  CHECK ("durationSeconds" IS NOT NULL OR "reps" IS NOT NULL);
