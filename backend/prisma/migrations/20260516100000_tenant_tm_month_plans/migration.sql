-- CreateTable
CREATE TABLE "tenant_tm_month_plans" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "mesPlanejado" DOUBLE PRECISION,
    "weekPlanHoras" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_tm_month_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_tm_month_plans_tenantId_year_month_key" ON "tenant_tm_month_plans"("tenantId", "year", "month");

CREATE INDEX "tenant_tm_month_plans_tenantId_year_month_idx" ON "tenant_tm_month_plans"("tenantId", "year", "month");

-- AddForeignKey
ALTER TABLE "tenant_tm_month_plans" ADD CONSTRAINT "tenant_tm_month_plans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
