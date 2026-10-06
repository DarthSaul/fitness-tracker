-- CreateEnum
CREATE TYPE "WeekStartDay" AS ENUM ('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "weekStartDay" "WeekStartDay" NOT NULL DEFAULT 'SUNDAY',
ADD COLUMN     "weeklyWorkoutGoal" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "weeklyWorkoutGoalEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Raw CHECK (Prisma can't express it): the goal is 1–7 workouts a week, the
-- same bound PATCH /api/auth/me validates (docs/weekly-goal/SPEC-weekly-goal.md).
ALTER TABLE "User" ADD CONSTRAINT "User_weeklyWorkoutGoal_range" CHECK ("weeklyWorkoutGoal" BETWEEN 1 AND 7);
