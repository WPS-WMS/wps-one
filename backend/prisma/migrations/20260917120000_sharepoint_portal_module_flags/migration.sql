-- SharePoint como módulo de plano + chaves de ativação por tenant.

ALTER TABLE "platform_plans"
  ADD COLUMN IF NOT EXISTS "moduleSharepoint" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "portalModuleEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "sharepointModuleEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Quem já usa SharePoint operacionalmente mantém acesso à tela.
UPDATE "Tenant"
SET "sharepointModuleEnabled" = true
WHERE "sharePointEnabled" = true
  AND "sharepointModuleEnabled" = false;
