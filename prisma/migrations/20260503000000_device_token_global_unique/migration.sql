-- Replace per-user device token uniqueness with global token+environment uniqueness.
-- This prevents the same physical APNs device token from being active under multiple users.

-- DropIndex
DROP INDEX "DeviceToken_userId_token_key";

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_environment_key" ON "DeviceToken"("token", "environment");
