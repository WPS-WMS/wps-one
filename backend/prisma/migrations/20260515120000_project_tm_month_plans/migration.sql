-- CreateTable
CREATE TABLE "project_tm_month_plans" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "mesPlanejado" DOUBLE PRECISION,
    "weekPlanHoras" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_tm_month_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_tm_month_plans_projectId_year_month_key" ON "project_tm_month_plans"("projectId", "year", "month");

CREATE INDEX "project_tm_month_plans_projectId_year_month_idx" ON "project_tm_month_plans"("projectId", "year", "month");

-- AddForeignKey
ALTER TABLE "project_tm_month_plans" ADD CONSTRAINT "project_tm_month_plans_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
