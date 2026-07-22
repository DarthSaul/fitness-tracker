-- CreateTable
CREATE TABLE "StandaloneWorkout" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StandaloneWorkout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandaloneWorkoutGroup" (
    "id" TEXT NOT NULL,
    "standaloneWorkoutId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "ExerciseGroupType" NOT NULL DEFAULT 'STANDARD',
    "label" TEXT,
    "restSeconds" INTEGER,

    CONSTRAINT "StandaloneWorkoutGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandaloneWorkoutExercise" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "StandaloneWorkoutExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandaloneWorkoutSet" (
    "id" TEXT NOT NULL,
    "standaloneWorkoutExerciseId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "reps" INTEGER,
    "weight" DOUBLE PRECISION,
    "rpe" DOUBLE PRECISION,
    "notes" TEXT,
    "effortTarget" TEXT,

    CONSTRAINT "StandaloneWorkoutSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandaloneWorkoutSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "standaloneWorkoutId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "StandaloneWorkoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandaloneCompletedSet" (
    "id" TEXT NOT NULL,
    "standaloneWorkoutSessionId" TEXT NOT NULL,
    "standaloneWorkoutSetId" TEXT,
    "adhocExerciseName" TEXT,
    "reps" INTEGER,
    "weight" DOUBLE PRECISION,
    "rpe" DOUBLE PRECISION,
    "notes" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StandaloneCompletedSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StandaloneWorkout_category_order_key" ON "StandaloneWorkout"("category", "order");

-- CreateIndex
CREATE UNIQUE INDEX "StandaloneWorkoutGroup_standaloneWorkoutId_order_key" ON "StandaloneWorkoutGroup"("standaloneWorkoutId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "StandaloneWorkoutExercise_groupId_order_key" ON "StandaloneWorkoutExercise"("groupId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "StandaloneWorkoutSet_standaloneWorkoutExerciseId_setNumber_key" ON "StandaloneWorkoutSet"("standaloneWorkoutExerciseId", "setNumber");

-- CreateIndex
CREATE INDEX "StandaloneWorkoutSession_userId_idx" ON "StandaloneWorkoutSession"("userId");

-- CreateIndex
CREATE INDEX "StandaloneWorkoutSession_standaloneWorkoutId_idx" ON "StandaloneWorkoutSession"("standaloneWorkoutId");

-- CreateIndex
CREATE UNIQUE INDEX "StandaloneCompletedSet_session_set_key" ON "StandaloneCompletedSet"("standaloneWorkoutSessionId", "standaloneWorkoutSetId");

-- CreateIndex
CREATE INDEX "StandaloneCompletedSet_standaloneWorkoutSessionId_idx" ON "StandaloneCompletedSet"("standaloneWorkoutSessionId");

-- AddForeignKey
ALTER TABLE "StandaloneWorkoutGroup" ADD CONSTRAINT "StandaloneWorkoutGroup_standaloneWorkoutId_fkey" FOREIGN KEY ("standaloneWorkoutId") REFERENCES "StandaloneWorkout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandaloneWorkoutExercise" ADD CONSTRAINT "StandaloneWorkoutExercise_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StandaloneWorkoutGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandaloneWorkoutExercise" ADD CONSTRAINT "StandaloneWorkoutExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandaloneWorkoutSet" ADD CONSTRAINT "StandaloneWorkoutSet_standaloneWorkoutExerciseId_fkey" FOREIGN KEY ("standaloneWorkoutExerciseId") REFERENCES "StandaloneWorkoutExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandaloneWorkoutSession" ADD CONSTRAINT "StandaloneWorkoutSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandaloneWorkoutSession" ADD CONSTRAINT "StandaloneWorkoutSession_standaloneWorkoutId_fkey" FOREIGN KEY ("standaloneWorkoutId") REFERENCES "StandaloneWorkout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandaloneCompletedSet" ADD CONSTRAINT "StandaloneCompletedSet_standaloneWorkoutSessionId_fkey" FOREIGN KEY ("standaloneWorkoutSessionId") REFERENCES "StandaloneWorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandaloneCompletedSet" ADD CONSTRAINT "StandaloneCompletedSet_standaloneWorkoutSetId_fkey" FOREIGN KEY ("standaloneWorkoutSetId") REFERENCES "StandaloneWorkoutSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Block direct PostgREST access (repo convention: every table gets RLS, no policies)
ALTER TABLE "StandaloneWorkout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StandaloneWorkoutGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StandaloneWorkoutExercise" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StandaloneWorkoutSet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StandaloneWorkoutSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StandaloneCompletedSet" ENABLE ROW LEVEL SECURITY;

-- DB-level guarantees mirroring the API rules: ordering starts at 1, set
-- numbers start at 1.
ALTER TABLE "StandaloneWorkout"
  ADD CONSTRAINT "StandaloneWorkout_order_positive" CHECK ("order" >= 1);
ALTER TABLE "StandaloneWorkoutGroup"
  ADD CONSTRAINT "StandaloneWorkoutGroup_order_positive" CHECK ("order" >= 1);
ALTER TABLE "StandaloneWorkoutExercise"
  ADD CONSTRAINT "StandaloneWorkoutExercise_order_positive" CHECK ("order" >= 1);
ALTER TABLE "StandaloneWorkoutSet"
  ADD CONSTRAINT "StandaloneWorkoutSet_setNumber_positive" CHECK ("setNumber" >= 1);

-- A completed set logs either a prescribed set (standaloneWorkoutSetId) or an
-- off-plan exercise (adhocExerciseName) — exactly one of the two.
ALTER TABLE "StandaloneCompletedSet"
  ADD CONSTRAINT "StandaloneCompletedSet_one_discriminator"
  CHECK (
    (("standaloneWorkoutSetId" IS NOT NULL)::int +
     ("adhocExerciseName" IS NOT NULL)::int) = 1
  );

-- At most one IN_PROGRESS session per (user, workout). Prisma cannot express a
-- partial unique index, so it is declared here (see schema.prisma note).
CREATE UNIQUE INDEX "StandaloneWorkoutSession_in_progress_partial_idx"
  ON "StandaloneWorkoutSession" ("userId", "standaloneWorkoutId")
  WHERE "status" = 'IN_PROGRESS';
