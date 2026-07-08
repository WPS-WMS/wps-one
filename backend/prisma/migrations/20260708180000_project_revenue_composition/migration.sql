-- Composição de custos e faturamento por parcela nas receitas de projeto.

ALTER TABLE "project_revenues"
ADD COLUMN IF NOT EXISTS "autoBillingCalculation" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "project_revenue_cost_lines" (
    "id" TEXT NOT NULL,
    "revenueId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "hourlyRate" DOUBLE PRECISION NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_revenue_cost_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "project_revenue_billing_lines" (
    "id" TEXT NOT NULL,
    "revenueId" TEXT NOT NULL,
    "milestone" TEXT,
    "installmentNumber" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_revenue_billing_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "project_revenue_cost_lines_revenue_sort_idx"
ON "project_revenue_cost_lines"("revenueId", "sortOrder");

CREATE INDEX IF NOT EXISTS "project_revenue_billing_lines_revenue_sort_idx"
ON "project_revenue_billing_lines"("revenueId", "sortOrder");

DO $$ BEGIN
  ALTER TABLE "project_revenue_cost_lines"
  ADD CONSTRAINT "project_revenue_cost_lines_revenueId_fkey"
  FOREIGN KEY ("revenueId") REFERENCES "project_revenues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "project_revenue_billing_lines"
  ADD CONSTRAINT "project_revenue_billing_lines_revenueId_fkey"
  FOREIGN KEY ("revenueId") REFERENCES "project_revenues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
