-- CreateTable
CREATE TABLE "ScheduledWorkout" (
    "id" TEXT NOT NULL,
    "userProgramId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledWorkout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledWorkout_userProgramId_weekNumber_dayNumber_key" ON "ScheduledWorkout"("userProgramId", "weekNumber", "dayNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledWorkout_userProgramId_scheduledDate_key" ON "ScheduledWorkout"("userProgramId", "scheduledDate");

-- AddForeignKey
ALTER TABLE "ScheduledWorkout" ADD CONSTRAINT "ScheduledWorkout_userProgramId_fkey" FOREIGN KEY ("userProgramId") REFERENCES "UserProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable RLS
ALTER TABLE "ScheduledWorkout" ENABLE ROW LEVEL SECURITY;
