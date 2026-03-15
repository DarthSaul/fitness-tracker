-- Merge duplicate Exercise records by repointing ProgramExercise rows
-- to the canonical Exercise, then deleting the duplicates.

-- 1-Arm DB Rows → 1-Arm DB Row
UPDATE "ProgramExercise"
SET "exerciseId" = (SELECT "id" FROM "Exercise" WHERE "name" = '1-Arm DB Row')
WHERE "exerciseId" = (SELECT "id" FROM "Exercise" WHERE "name" = '1-Arm DB Rows');

DELETE FROM "Exercise" WHERE "name" = '1-Arm DB Rows';

-- DB Pullovers → DB Pullover
UPDATE "ProgramExercise"
SET "exerciseId" = (SELECT "id" FROM "Exercise" WHERE "name" = 'DB Pullover')
WHERE "exerciseId" = (SELECT "id" FROM "Exercise" WHERE "name" = 'DB Pullovers');

DELETE FROM "Exercise" WHERE "name" = 'DB Pullovers';

-- DB Reverse Lunges → DB Reverse Lunge
UPDATE "ProgramExercise"
SET "exerciseId" = (SELECT "id" FROM "Exercise" WHERE "name" = 'DB Reverse Lunge')
WHERE "exerciseId" = (SELECT "id" FROM "Exercise" WHERE "name" = 'DB Reverse Lunges');

DELETE FROM "Exercise" WHERE "name" = 'DB Reverse Lunges';

-- DB Reverse Lunges Alt. → DB Reverse Lunge
UPDATE "ProgramExercise"
SET "exerciseId" = (SELECT "id" FROM "Exercise" WHERE "name" = 'DB Reverse Lunge')
WHERE "exerciseId" = (SELECT "id" FROM "Exercise" WHERE "name" = 'DB Reverse Lunges Alt.');

DELETE FROM "Exercise" WHERE "name" = 'DB Reverse Lunges Alt.';

-- BB Overhead Press → BB Standing Overhead Press
UPDATE "ProgramExercise"
SET "exerciseId" = (SELECT "id" FROM "Exercise" WHERE "name" = 'BB Standing Overhead Press')
WHERE "exerciseId" = (SELECT "id" FROM "Exercise" WHERE "name" = 'BB Overhead Press');

DELETE FROM "Exercise" WHERE "name" = 'BB Overhead Press';

-- BB Overhead Press (Standing) → BB Standing Overhead Press
UPDATE "ProgramExercise"
SET "exerciseId" = (SELECT "id" FROM "Exercise" WHERE "name" = 'BB Standing Overhead Press')
WHERE "exerciseId" = (SELECT "id" FROM "Exercise" WHERE "name" = 'BB Overhead Press (Standing)');

DELETE FROM "Exercise" WHERE "name" = 'BB Overhead Press (Standing)';

-- Standing BB Overhead Press → BB Standing Overhead Press
UPDATE "ProgramExercise"
SET "exerciseId" = (SELECT "id" FROM "Exercise" WHERE "name" = 'BB Standing Overhead Press')
WHERE "exerciseId" = (SELECT "id" FROM "Exercise" WHERE "name" = 'Standing BB Overhead Press');

DELETE FROM "Exercise" WHERE "name" = 'Standing BB Overhead Press';
