-- Feriados por tenant (data civil sem horário).
-- Idempotente: seguro para rodar mais de uma vez.

DO $$
BEGIN
  IF to_regclass('public."tenant_holidays"') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE "tenant_holidays" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "date" DATE NOT NULL,
        "name" TEXT NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "tenant_holidays_pkey" PRIMARY KEY ("id")
      )
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "tenant_holidays"
      ADD CONSTRAINT "tenant_holidays_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

-- Índices/constraints adicionais (idempotentes).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'tenant_holidays_tenant_date_uq'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX "tenant_holidays_tenant_date_uq" ON "tenant_holidays" ("tenantId", "date")';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'tenant_holidays_tenant_date_idx'
  ) THEN
    EXECUTE 'CREATE INDEX "tenant_holidays_tenant_date_idx" ON "tenant_holidays" ("tenantId", "date")';
  END IF;
END $$;

