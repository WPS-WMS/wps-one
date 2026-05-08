-- Padronizar código de TimeEntryPermissionRequest: PERM-000123 (sequencial por tenant)
-- Adiciona tenantId + seq + code e tabela tenant_counters.
-- Idempotente.

-- 1) tenant_counters
DO $$
BEGIN
  IF to_regclass('public."tenant_counters"') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE "tenant_counters" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "key" TEXT NOT NULL,
        "value" INTEGER NOT NULL DEFAULT 0,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "tenant_counters_pkey" PRIMARY KEY ("id")
      )
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "tenant_counters"
      ADD CONSTRAINT "tenant_counters_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_counters_tenant_key_uq') THEN
    EXECUTE 'ALTER TABLE "tenant_counters" ADD CONSTRAINT "tenant_counters_tenant_key_uq" UNIQUE ("tenantId", "key")';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'tenant_counters_tenant_idx') THEN
    EXECUTE 'CREATE INDEX "tenant_counters_tenant_idx" ON "tenant_counters" ("tenantId")';
  END IF;
END $$;

-- 2) Colunas na timeEntryPermissionRequests
DO $$
BEGIN
  -- Prisma (sem @@map) cria tabela com nome quoted do model: "TimeEntryPermissionRequest"
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'TimeEntryPermissionRequest') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'TimeEntryPermissionRequest' AND column_name = 'tenantId'
    ) THEN
      EXECUTE 'ALTER TABLE "TimeEntryPermissionRequest" ADD COLUMN "tenantId" TEXT';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'TimeEntryPermissionRequest' AND column_name = 'seq'
    ) THEN
      EXECUTE 'ALTER TABLE "TimeEntryPermissionRequest" ADD COLUMN "seq" INTEGER';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'TimeEntryPermissionRequest' AND column_name = 'code'
    ) THEN
      EXECUTE 'ALTER TABLE "TimeEntryPermissionRequest" ADD COLUMN "code" TEXT';
    END IF;
  END IF;
END $$;

-- Backfill tenantId baseado no usuário
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='TimeEntryPermissionRequest' AND column_name='tenantId') THEN
    EXECUTE $SQL$
      UPDATE "TimeEntryPermissionRequest" r
      SET "tenantId" = u."tenantId"
      FROM "users" u
      WHERE r."tenantId" IS NULL AND r."userId" = u."id"
    $SQL$;
  END IF;
END $$;

-- FK tenantId
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'timeEntryPermissionRequests_tenantId_fkey') THEN
    EXECUTE $SQL$
      ALTER TABLE "TimeEntryPermissionRequest"
      ADD CONSTRAINT "timeEntryPermissionRequests_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

-- Índice tenant/status/createdAt
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'time_entry_permission_req_tenant_status_created_idx'
  ) THEN
    EXECUTE 'CREATE INDEX "time_entry_permission_req_tenant_status_created_idx" ON "TimeEntryPermissionRequest" ("tenantId", "status", "createdAt")';
  END IF;
END $$;

-- Unique (tenantId, seq) para permitir PERM-000123 por tenant
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_entry_permission_req_tenant_seq_uq') THEN
    EXECUTE 'ALTER TABLE "TimeEntryPermissionRequest" ADD CONSTRAINT "time_entry_permission_req_tenant_seq_uq" UNIQUE ("tenantId", "seq")';
  END IF;
END $$;

