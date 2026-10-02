-- CreateEnum
CREATE TYPE "WorkoutReminderDay" AS ENUM ('SAME_DAY', 'DAY_BEFORE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "workoutReminderDay" "WorkoutReminderDay" NOT NULL DEFAULT 'SAME_DAY';

