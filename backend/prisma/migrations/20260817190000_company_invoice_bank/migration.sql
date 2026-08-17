-- Banco da invoice separado do banco da nota de débito.

ALTER TABLE "tenant_company_profiles"
  ADD COLUMN IF NOT EXISTS "invoiceBanco" TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceTitularConta" TEXT;

UPDATE "tenant_company_profiles"
SET "invoiceBanco" = "banco"
WHERE "invoiceBanco" IS NULL AND "banco" IS NOT NULL;

UPDATE "tenant_company_profiles"
SET "invoiceTitularConta" = "titularConta"
WHERE "invoiceTitularConta" IS NULL AND "titularConta" IS NOT NULL;
