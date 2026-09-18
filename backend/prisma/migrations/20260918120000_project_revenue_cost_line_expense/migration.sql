-- Despesas embutidas na composição de custos da receita do projeto.

ALTER TABLE "project_revenue_cost_lines"
ADD COLUMN IF NOT EXISTS "isExpense" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "project_revenue_cost_lines"
ADD COLUMN IF NOT EXISTS "reimbursementTypeId" TEXT;

CREATE INDEX IF NOT EXISTS "project_revenue_cost_lines_reimbursement_type_idx"
ON "project_revenue_cost_lines"("reimbursementTypeId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_revenue_cost_lines_reimbursementTypeId_fkey'
  ) THEN
    ALTER TABLE "project_revenue_cost_lines"
    ADD CONSTRAINT "project_revenue_cost_lines_reimbursementTypeId_fkey"
    FOREIGN KEY ("reimbursementTypeId") REFERENCES "reimbursement_types"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
