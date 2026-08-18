-- Tipos de impostos configuráveis (Configurações > Impostos).

CREATE TABLE IF NOT EXISTS "tax_types" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ratePercent" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tax_types_tenant_name_uq"
ON "tax_types"("tenantId", "name");

CREATE INDEX IF NOT EXISTS "tax_types_tenant_active_name_idx"
ON "tax_types"("tenantId", "isActive", "name");

DO $$ BEGIN
  ALTER TABLE "tax_types"
  ADD CONSTRAINT "tax_types_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
