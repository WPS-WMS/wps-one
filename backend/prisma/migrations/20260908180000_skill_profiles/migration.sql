-- CreateTable
CREATE TABLE "skill_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_revenue_skill_rates" (
    "id" TEXT NOT NULL,
    "revenueId" TEXT NOT NULL,
    "skillProfileId" TEXT NOT NULL,
    "hourlyRate" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_revenue_skill_rates_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN "skillProfileId" TEXT;

-- CreateIndex
CREATE INDEX "skill_profiles_tenant_active_name_idx" ON "skill_profiles"("tenantId", "isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "skill_profiles_tenant_name_uq" ON "skill_profiles"("tenantId", "name");

-- CreateIndex
CREATE INDEX "project_revenue_skill_rates_revenue_sort_idx" ON "project_revenue_skill_rates"("revenueId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "project_revenue_skill_rates_revenue_skill_uq" ON "project_revenue_skill_rates"("revenueId", "skillProfileId");

-- CreateIndex
CREATE INDEX "users_skill_profile_idx" ON "users"("skillProfileId");

-- AddForeignKey
ALTER TABLE "skill_profiles" ADD CONSTRAINT "skill_profiles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_skillProfileId_fkey" FOREIGN KEY ("skillProfileId") REFERENCES "skill_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_revenue_skill_rates" ADD CONSTRAINT "project_revenue_skill_rates_revenueId_fkey" FOREIGN KEY ("revenueId") REFERENCES "project_revenues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_revenue_skill_rates" ADD CONSTRAINT "project_revenue_skill_rates_skillProfileId_fkey" FOREIGN KEY ("skillProfileId") REFERENCES "skill_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
