-- Campos de invoice internacional no cadastro da empresa + snapshot na parcela.

ALTER TABLE "tenant_company_profiles" ADD COLUMN IF NOT EXISTS "pais" TEXT DEFAULT 'Brazil';
ALTER TABLE "tenant_company_profiles" ADD COLUMN IF NOT EXISTS "iban" TEXT;
ALTER TABLE "tenant_company_profiles" ADD COLUMN IF NOT EXISTS "bancoSwift" TEXT;
ALTER TABLE "tenant_company_profiles" ADD COLUMN IF NOT EXISTS "bancoEndereco" TEXT;
ALTER TABLE "tenant_company_profiles" ADD COLUMN IF NOT EXISTS "intermediarioBanco" TEXT;
ALTER TABLE "tenant_company_profiles" ADD COLUMN IF NOT EXISTS "intermediarioSwift" TEXT;
ALTER TABLE "tenant_company_profiles" ADD COLUMN IF NOT EXISTS "intermediarioMoeda" TEXT;

ALTER TABLE "receivable_installments" ADD COLUMN IF NOT EXISTS "billingDocumentType" TEXT;
ALTER TABLE "receivable_installments" ADD COLUMN IF NOT EXISTS "internalDocumentSnapshot" JSONB;
