-- Forma de pagamento e tipo de contrato na recorrência de contas a pagar
ALTER TABLE "payable_recurrence_rules" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "payable_recurrence_rules" ADD COLUMN IF NOT EXISTS "contractTypeId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payable_recurrence_rules_contractTypeId_fkey'
  ) THEN
    ALTER TABLE "payable_recurrence_rules"
      ADD CONSTRAINT "payable_recurrence_rules_contractTypeId_fkey"
      FOREIGN KEY ("contractTypeId") REFERENCES "contract_types"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
