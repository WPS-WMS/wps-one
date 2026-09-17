-- CreateTable
CREATE TABLE IF NOT EXISTS "tenant_user_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "layoutShell" TEXT NOT NULL DEFAULT 'consultor',
    "requiresClientLink" BOOLEAN NOT NULL DEFAULT false,
    "requiresTimeEntry" BOOLEAN NOT NULL DEFAULT true,
    "excludeFromHourBank" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_user_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_user_profiles_tenant_code_uq"
  ON "tenant_user_profiles"("tenantId", "code");

CREATE INDEX IF NOT EXISTS "tenant_user_profiles_tenant_active_idx"
  ON "tenant_user_profiles"("tenantId", "isActive", "sortOrder", "name");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenant_user_profiles_tenantId_fkey'
  ) THEN
    ALTER TABLE "tenant_user_profiles"
      ADD CONSTRAINT "tenant_user_profiles_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
