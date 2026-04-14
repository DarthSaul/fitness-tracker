-- AlterTable: add notes to WorkoutSession
ALTER TABLE "WorkoutSession" ADD COLUMN "notes" TEXT;

-- AlterTable: make exerciseSetId nullable and add programExerciseId to CompletedSet
ALTER TABLE "CompletedSet" ALTER COLUMN "exerciseSetId" DROP NOT NULL;
ALTER TABLE "CompletedSet" ADD COLUMN "programExerciseId" TEXT;

-- CreateTable: UserExerciseNote
CREATE TABLE "UserExerciseNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserExerciseNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WorkoutExerciseSwap
CREATE TABLE "WorkoutExerciseSwap" (
    "id" TEXT NOT NULL,
    "workoutSessionId" TEXT NOT NULL,
    "programExerciseId" TEXT NOT NULL,
    "originalExerciseId" TEXT NOT NULL,
    "replacementExerciseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutExerciseSwap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserExerciseNote_userId_exerciseId_key" ON "UserExerciseNote"("userId", "exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutExerciseSwap_workoutSessionId_programExerciseId_key" ON "WorkoutExerciseSwap"("workoutSessionId", "programExerciseId");

-- AddForeignKey: UserExerciseNote → User
ALTER TABLE "UserExerciseNote" ADD CONSTRAINT "UserExerciseNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: UserExerciseNote → Exercise
ALTER TABLE "UserExerciseNote" ADD CONSTRAINT "UserExerciseNote_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: WorkoutExerciseSwap → WorkoutSession
ALTER TABLE "WorkoutExerciseSwap" ADD CONSTRAINT "WorkoutExerciseSwap_workoutSessionId_fkey" FOREIGN KEY ("workoutSessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: WorkoutExerciseSwap → Exercise (original)
ALTER TABLE "WorkoutExerciseSwap" ADD CONSTRAINT "WorkoutExerciseSwap_originalExerciseId_fkey" FOREIGN KEY ("originalExerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: WorkoutExerciseSwap → Exercise (replacement)
ALTER TABLE "WorkoutExerciseSwap" ADD CONSTRAINT "WorkoutExerciseSwap_replacementExerciseId_fkey" FOREIGN KEY ("replacementExerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
