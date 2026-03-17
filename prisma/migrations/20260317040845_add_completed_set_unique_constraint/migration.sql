-- AddUniqueConstraint: CompletedSet(workoutSessionId, exerciseSetId)
CREATE UNIQUE INDEX "CompletedSet_workoutSessionId_exerciseSetId_key" ON "CompletedSet"("workoutSessionId", "exerciseSetId");
