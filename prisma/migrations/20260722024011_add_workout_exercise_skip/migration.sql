-- CreateTable: WorkoutExerciseSkip
CREATE TABLE "WorkoutExerciseSkip" (
    "id" TEXT NOT NULL,
    "workoutSessionId" TEXT NOT NULL,
    "programExerciseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutExerciseSkip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutExerciseSkip_workoutSessionId_programExerciseId_key" ON "WorkoutExerciseSkip"("workoutSessionId", "programExerciseId");

-- CreateIndex
CREATE INDEX "WorkoutExerciseSkip_programExerciseId_idx" ON "WorkoutExerciseSkip"("programExerciseId");

-- AddForeignKey: WorkoutExerciseSkip → WorkoutSession
ALTER TABLE "WorkoutExerciseSkip" ADD CONSTRAINT "WorkoutExerciseSkip_workoutSessionId_fkey" FOREIGN KEY ("workoutSessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: WorkoutExerciseSkip → ProgramExercise
ALTER TABLE "WorkoutExerciseSkip" ADD CONSTRAINT "WorkoutExerciseSkip_programExerciseId_fkey" FOREIGN KEY ("programExerciseId") REFERENCES "ProgramExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable RLS (repo convention: every table gets RLS, no policies — access is via Prisma service role)
ALTER TABLE "WorkoutExerciseSkip" ENABLE ROW LEVEL SECURITY;
