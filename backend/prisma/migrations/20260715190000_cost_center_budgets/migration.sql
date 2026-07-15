-- Orçamento mensal por centro de custo (Controle de orçamento)
CREATE TABLE IF NOT EXISTS "cost_center_budgets" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "costCenterId" TEXT NOT NULL,
  "competenceDate" DATE NOT NULL,
  "amountCents" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cost_center_budgets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cost_center_budgets_tenant_cc_comp_uq"
  ON "cost_center_budgets"("tenantId", "costCenterId", "competenceDate");

CREATE INDEX IF NOT EXISTS "cost_center_budgets_tenant_comp_idx"
  ON "cost_center_budgets"("tenantId", "competenceDate");

DO $$ BEGIN
  ALTER TABLE "cost_center_budgets"
    ADD CONSTRAINT "cost_center_budgets_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "cost_center_budgets"
    ADD CONSTRAINT "cost_center_budgets_costCenterId_fkey"
    FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "cost_center_budgets"
    ADD CONSTRAINT "cost_center_budgets_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
