-- Tipo de contrato no cadastro do fornecedor (catálogo contract_types).
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "contractTypeId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_contractTypeId_fkey'
  ) THEN
    ALTER TABLE "suppliers"
      ADD CONSTRAINT "suppliers_contractTypeId_fkey"
      FOREIGN KEY ("contractTypeId") REFERENCES "contract_types"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "suppliers_tenant_contract_type_idx"
  ON "suppliers"("tenantId", "contractTypeId");

-- Backfill: copia do employmentType do usuário vinculado (legado / principal).
UPDATE "suppliers" s
SET "contractTypeId" = ct.id
FROM "users" u
INNER JOIN "contract_types" ct
  ON lower(ct.name) = lower(u."employmentType")
WHERE s."linkedUserId" = u.id
  AND ct."tenantId" = s."tenantId"
  AND u."employmentType" IS NOT NULL
  AND trim(u."employmentType") <> ''
  AND s."contractTypeId" IS NULL;

-- Backfill: via vínculos N:N (primeiro usuário com employmentType).
UPDATE "suppliers" s
SET "contractTypeId" = src.ct_id
FROM (
  SELECT DISTINCT ON (sul."supplierId")
    sul."supplierId" AS supplier_id,
    ct.id AS ct_id
  FROM "supplier_user_links" sul
  INNER JOIN "users" u ON u.id = sul."userId"
  INNER JOIN "suppliers" s2 ON s2.id = sul."supplierId"
  INNER JOIN "contract_types" ct
    ON ct."tenantId" = s2."tenantId"
   AND lower(ct.name) = lower(u."employmentType")
  WHERE u."employmentType" IS NOT NULL
    AND trim(u."employmentType") <> ''
  ORDER BY sul."supplierId", sul."createdAt" ASC
) src
WHERE s.id = src.supplier_id
  AND s."contractTypeId" IS NULL;
