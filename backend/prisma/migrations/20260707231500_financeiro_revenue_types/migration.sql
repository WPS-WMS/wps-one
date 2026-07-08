CREATE TABLE IF NOT EXISTS "revenue_types" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "revenue_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "revenue_types_tenant_name_uq" ON "revenue_types"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "revenue_types_tenant_active_name_idx" ON "revenue_types"("tenantId", "isActive", "name");

DO $$ BEGIN
  ALTER TABLE "revenue_types" ADD CONSTRAINT "revenue_types_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
