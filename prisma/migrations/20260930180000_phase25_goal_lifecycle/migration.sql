-- AlterTable
ALTER TABLE "Goal" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "Goal" ADD COLUMN "archivedByUserId" TEXT;

-- CreateTable
CREATE TABLE "GoalLifecycleHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "goalId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "performedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalLifecycleHistory_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GoalLifecycleHistory_goalId_idx" ON "GoalLifecycleHistory"("goalId");
