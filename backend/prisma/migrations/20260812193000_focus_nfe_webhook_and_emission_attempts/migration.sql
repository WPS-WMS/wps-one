-- Webhook Focus NFSe Nacional + histórico de tentativas de emissão
ALTER TABLE "tenant_focus_nfe_configs"
ADD COLUMN IF NOT EXISTS "webhookSecret" TEXT,
ADD COLUMN IF NOT EXISTS "webhookHookId" TEXT,
ADD COLUMN IF NOT EXISTS "webhookHookEnvironment" TEXT;

CREATE TABLE IF NOT EXISTS "receivable_nfse_emission_attempts" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "receivableId" TEXT NOT NULL,
  "installmentId" TEXT NOT NULL,
  "focusNfeRef" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "nfNumber" TEXT,
  "codigoIss" TEXT,
  "focusNfeUrl" TEXT,
  "focusNfeDanfseUrl" TEXT,
  "errorMessage" TEXT,
  "source" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "receivable_nfse_emission_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "nfse_emission_attempts_tenant_ref_uq"
ON "receivable_nfse_emission_attempts"("tenantId", "focusNfeRef");

CREATE INDEX IF NOT EXISTS "nfse_emission_attempts_installment_created_idx"
ON "receivable_nfse_emission_attempts"("installmentId", "createdAt");

CREATE INDEX IF NOT EXISTS "nfse_emission_attempts_receivable_created_idx"
ON "receivable_nfse_emission_attempts"("receivableId", "createdAt");

CREATE INDEX IF NOT EXISTS "nfse_emission_attempts_ref_idx"
ON "receivable_nfse_emission_attempts"("focusNfeRef");

DO $$ BEGIN
  ALTER TABLE "receivable_nfse_emission_attempts"
    ADD CONSTRAINT "receivable_nfse_emission_attempts_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "receivable_nfse_emission_attempts"
    ADD CONSTRAINT "receivable_nfse_emission_attempts_receivableId_fkey"
    FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "receivable_nfse_emission_attempts"
    ADD CONSTRAINT "receivable_nfse_emission_attempts_installmentId_fkey"
    FOREIGN KEY ("installmentId") REFERENCES "receivable_installments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "receivable_nfse_emission_attempts"
    ADD CONSTRAINT "receivable_nfse_emission_attempts_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
