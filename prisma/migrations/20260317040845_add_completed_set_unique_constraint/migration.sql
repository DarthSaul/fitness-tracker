-- AddUniqueConstraint: CompletedSet(workoutSessionId, exerciseSetId)

-- Remove duplicate rows before adding constraint (keep the one with the smallest id)
DELETE FROM "CompletedSet"
WHERE id NOT IN (
  SELECT MIN(id) FROM "CompletedSet"
  GROUP BY "workoutSessionId", "exerciseSetId"
);

CREATE UNIQUE INDEX "CompletedSet_workoutSessionId_exerciseSetId_key" ON "CompletedSet"("workoutSessionId", "exerciseSetId");
