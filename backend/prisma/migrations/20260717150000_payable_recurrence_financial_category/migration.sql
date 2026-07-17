-- Categoria financeira nas regras de recorrência de contas a pagar
ALTER TABLE "payable_recurrence_rules" ADD COLUMN IF NOT EXISTS "financialCategoryId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payable_recurrence_rules_financialCategoryId_fkey'
  ) THEN
    ALTER TABLE "payable_recurrence_rules"
      ADD CONSTRAINT "payable_recurrence_rules_financialCategoryId_fkey"
      FOREIGN KEY ("financialCategoryId") REFERENCES "financial_categories"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "payable_recurrence_rules_financialCategoryId_idx"
  ON "payable_recurrence_rules"("financialCategoryId");
