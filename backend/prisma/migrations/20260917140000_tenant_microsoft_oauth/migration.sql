-- OAuth Microsoft por empresa (SharePoint no tenant do cliente).

ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "microsoftOauthTenantId" TEXT;

ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "microsoftOauthAccountEmail" TEXT;

ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "microsoftOauthRefreshToken" TEXT;

ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "microsoftOauthConnectedAt" TIMESTAMP(3);
