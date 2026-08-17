-- Numeração configurável de invoice e nota de débito no cadastro da empresa.

ALTER TABLE "tenant_company_profiles"
  ADD COLUMN IF NOT EXISTS "invoicePrefix" TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceNextNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "invoicePadLength" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS "debitNotePrefix" TEXT,
  ADD COLUMN IF NOT EXISTS "debitNoteNextNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "debitNotePadLength" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "debitNoteIncludeYear" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "debitNoteYear" INTEGER;

-- Preserva a sequência já usada pelos contadores antigos (TenantCounter).
UPDATE "tenant_company_profiles" p
SET "invoiceNextNumber" = c.value + 1
FROM "tenant_counters" c
WHERE c."tenantId" = p."tenantId"
  AND c.key = 'internalInvoice'
  AND p."invoiceNextNumber" = 1
  AND c.value >= 1;

UPDATE "tenant_company_profiles" p
SET
  "debitNoteNextNumber" = c.value + 1,
  "debitNoteYear" = EXTRACT(YEAR FROM (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))::integer
FROM "tenant_counters" c
WHERE c."tenantId" = p."tenantId"
  AND c.key = 'internalDebitNote:' || EXTRACT(YEAR FROM (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))::text
  AND p."debitNoteNextNumber" = 1
  AND c.value >= 1;
