-- Campos habilitados por tipo (categoria financeira) em Contas a Pagar
ALTER TABLE "financial_categories" ADD COLUMN IF NOT EXISTS "enableHourRate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "financial_categories" ADD COLUMN IF NOT EXISTS "enableAmount" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "financial_categories" ADD COLUMN IF NOT EXISTS "enableBenefit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "financial_categories" ADD COLUMN IF NOT EXISTS "enableReimbursement" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "financial_categories" ADD COLUMN IF NOT EXISTS "enableDiscount" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "financial_categories" ADD COLUMN IF NOT EXISTS "enableComplementaryHours" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "financial_categories" ADD COLUMN IF NOT EXISTS "enableInterestFine" BOOLEAN NOT NULL DEFAULT false;
