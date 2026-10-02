-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('FOLLOW_REQUEST', 'NEW_FOLLOWER', 'FOLLOW_ACCEPTED', 'POST_REACTION', 'WORKOUT_REMINDER', 'WORKOUT_UNFINISHED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "timezone" TEXT,
ADD COLUMN     "workoutReminderMinute" INTEGER NOT NULL DEFAULT 480;

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "actorId" TEXT,
    "postId" TEXT,
    "followId" TEXT,
    "workoutSessionId" TEXT,
    "standaloneSessionId" TEXT,
    "scheduledWorkoutId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "pushedAt" TIMESTAMP(3),
    "pushAttempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "pushEnabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId","type")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_recipientId_dismissedAt_createdAt_id_idx" ON "Notification"("recipientId", "dismissedAt", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Notification_actorId_idx" ON "Notification"("actorId");

-- CreateIndex
CREATE INDEX "Notification_followId_idx" ON "Notification"("followId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workoutSessionId_fkey" FOREIGN KEY ("workoutSessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_standaloneSessionId_fkey" FOREIGN KEY ("standaloneSessionId") REFERENCES "StandaloneWorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_scheduledWorkoutId_fkey" FOREIGN KEY ("scheduledWorkoutId") REFERENCES "ScheduledWorkout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Raw SQL Prisma cannot express (documented in the schema.prisma header).
CREATE INDEX "Notification_unread_idx" ON "Notification" ("recipientId") WHERE "readAt" IS NULL AND "dismissedAt" IS NULL;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actor_not_recipient" CHECK ("actorId" IS NULL OR "actorId" <> "recipientId");

ALTER TABLE "User" ADD CONSTRAINT "User_workoutReminderMinute_range" CHECK ("workoutReminderMinute" BETWEEN 0 AND 1439);
