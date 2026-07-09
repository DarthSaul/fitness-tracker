-- Align the CoreWorkout time CHECKs with the API contract by adding the 3600
-- upper bound (PUT /api/workouts/:id/core-workout validates timeSeconds 1..3600
-- and restSeconds 0..3600). Replaces the lower-bound-only constraints from
-- 20260709153852_reshape_core_to_circuit.
ALTER TABLE "CoreWorkout" DROP CONSTRAINT "CoreWorkout_time_positive";
ALTER TABLE "CoreWorkout" DROP CONSTRAINT "CoreWorkout_rest_non_negative";

ALTER TABLE "CoreWorkout"
  ADD CONSTRAINT "CoreWorkout_time_bounds"
  CHECK ("timeSeconds" >= 1 AND "timeSeconds" <= 3600);
ALTER TABLE "CoreWorkout"
  ADD CONSTRAINT "CoreWorkout_rest_bounds"
  CHECK ("restSeconds" >= 0 AND "restSeconds" <= 3600);
