-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isPrimaryAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: primeiro SUPER_ADMIN de cada tenant vira o admin provisionado pela plataforma
UPDATE "users" AS u
SET "isPrimaryAdmin" = true
FROM (
  SELECT DISTINCT ON ("tenantId") id
  FROM "users"
  WHERE role = 'SUPER_ADMIN'
  ORDER BY "tenantId", "createdAt" ASC
) AS first_admin
WHERE u.id = first_admin.id
  AND u."isPrimaryAdmin" = false;
