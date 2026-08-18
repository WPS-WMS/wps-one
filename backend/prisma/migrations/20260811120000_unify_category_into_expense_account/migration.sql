-- Unifica metadados de categorias financeiras nas contas DESPESA do plano de contas.
ALTER TABLE "financial_accounts" ADD COLUMN IF NOT EXISTS "dreSubcategory" TEXT;
ALTER TABLE "financial_accounts" ADD COLUMN IF NOT EXISTS "enableHourRate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "financial_accounts" ADD COLUMN IF NOT EXISTS "enableAmount" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "financial_accounts" ADD COLUMN IF NOT EXISTS "enableBenefit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "financial_accounts" ADD COLUMN IF NOT EXISTS "enableReimbursement" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "financial_accounts" ADD COLUMN IF NOT EXISTS "enableDiscount" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "financial_accounts" ADD COLUMN IF NOT EXISTS "enableComplementaryHours" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "financial_accounts" ADD COLUMN IF NOT EXISTS "enableInterestFine" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: copiar flags/DRE da categoria para conta DESPESA de mesmo nome (case-insensitive).
-- Aliases: Reembolso ↔ Reembolsos.
UPDATE "financial_accounts" AS a
SET
  "dreSubcategory" = COALESCE(a."dreSubcategory", c."dreSubcategory"),
  "enableHourRate" = CASE WHEN c."enableHourRate" THEN true ELSE a."enableHourRate" END,
  "enableAmount" = CASE WHEN c."enableAmount" THEN true ELSE a."enableAmount" END,
  "enableBenefit" = CASE WHEN c."enableBenefit" THEN true ELSE a."enableBenefit" END,
  "enableReimbursement" = CASE WHEN c."enableReimbursement" THEN true ELSE a."enableReimbursement" END,
  "enableDiscount" = CASE WHEN c."enableDiscount" THEN true ELSE a."enableDiscount" END,
  "enableComplementaryHours" = CASE WHEN c."enableComplementaryHours" THEN true ELSE a."enableComplementaryHours" END,
  "enableInterestFine" = CASE WHEN c."enableInterestFine" THEN true ELSE a."enableInterestFine" END,
  "updatedAt" = NOW()
FROM "financial_categories" AS c
WHERE a."tenantId" = c."tenantId"
  AND a."type" = 'DESPESA'
  AND (
    lower(a."name") = lower(c."name")
    OR (lower(a."name") IN ('reembolso', 'reembolsos') AND lower(c."name") IN ('reembolso', 'reembolsos'))
  );

-- Defaults úteis para contas seed sem categoria correspondente.
UPDATE "financial_accounts"
SET "dreSubcategory" = 'IMPOSTO', "enableAmount" = true, "enableInterestFine" = true, "updatedAt" = NOW()
WHERE "type" = 'DESPESA' AND lower("name") = 'impostos' AND "dreSubcategory" IS NULL;

UPDATE "financial_accounts"
SET "dreSubcategory" = 'REEMBOLSOS', "enableAmount" = true, "enableReimbursement" = true, "updatedAt" = NOW()
WHERE "type" = 'DESPESA' AND lower("name") IN ('reembolso', 'reembolsos') AND "dreSubcategory" IS NULL;

UPDATE "financial_accounts"
SET "dreSubcategory" = 'CUSTO', "enableAmount" = true, "enableHourRate" = true, "enableDiscount" = true, "enableComplementaryHours" = true, "updatedAt" = NOW()
WHERE "type" = 'DESPESA' AND lower("name") = 'folha' AND "dreSubcategory" IS NULL;

-- Criar contas DESPESA para categorias sem conta correspondente.
INSERT INTO "financial_accounts" (
  "id", "tenantId", "name", "type", "isActive",
  "dreSubcategory",
  "enableHourRate", "enableAmount", "enableBenefit", "enableReimbursement",
  "enableDiscount", "enableComplementaryHours", "enableInterestFine",
  "createdAt", "updatedAt"
)
SELECT
  replace(gen_random_uuid()::text, '-', ''),
  c."tenantId",
  c."name",
  'DESPESA',
  c."isActive",
  c."dreSubcategory",
  c."enableHourRate",
  CASE
    WHEN c."enableAmount"
      OR c."enableHourRate"
      OR c."enableDiscount"
      OR c."enableComplementaryHours"
      OR c."enableInterestFine"
      OR c."enableBenefit"
      OR c."enableReimbursement"
    THEN c."enableAmount"
    ELSE true
  END,
  c."enableBenefit",
  c."enableReimbursement",
  c."enableDiscount",
  c."enableComplementaryHours",
  c."enableInterestFine",
  NOW(),
  NOW()
FROM "financial_categories" c
WHERE NOT EXISTS (
  SELECT 1 FROM "financial_accounts" a
  WHERE a."tenantId" = c."tenantId"
    AND a."type" = 'DESPESA'
    AND (
      lower(a."name") = lower(c."name")
      OR (lower(a."name") IN ('reembolso', 'reembolsos') AND lower(c."name") IN ('reembolso', 'reembolsos'))
    )
);

-- Religar payables à conta DESPESA da categoria (corrige default “sempre Folha”).
UPDATE "payables" AS p
SET "financialAccountId" = a."id", "updatedAt" = NOW()
FROM "financial_categories" AS c
JOIN "financial_accounts" AS a
  ON a."tenantId" = c."tenantId"
 AND a."type" = 'DESPESA'
 AND (
   lower(a."name") = lower(c."name")
   OR (lower(a."name") IN ('reembolso', 'reembolsos') AND lower(c."name") IN ('reembolso', 'reembolsos'))
 )
WHERE p."financialCategoryId" = c."id"
  AND p."tenantId" = c."tenantId";

UPDATE "payable_recurrence_rules" AS r
SET "financialAccountId" = a."id", "updatedAt" = NOW()
FROM "financial_categories" AS c
JOIN "financial_accounts" AS a
  ON a."tenantId" = c."tenantId"
 AND a."type" = 'DESPESA'
 AND (
   lower(a."name") = lower(c."name")
   OR (lower(a."name") IN ('reembolso', 'reembolsos') AND lower(c."name") IN ('reembolso', 'reembolsos'))
 )
WHERE r."financialCategoryId" = c."id"
  AND r."tenantId" = c."tenantId";
