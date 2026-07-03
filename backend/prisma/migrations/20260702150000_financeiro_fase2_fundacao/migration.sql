-- Financeiro Fase 2 — fundação: hierarquia de projetos, tipos de cobrança/contrato, receitas e contratos.
-- Idempotente: seguro para rodar mais de uma vez.

-- 0) parentProjectId em Project
DO $$
BEGIN
  IF to_regclass('public."Project"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'Project' AND column_name = 'parentProjectId'
     ) THEN
    EXECUTE 'ALTER TABLE "Project" ADD COLUMN "parentProjectId" TEXT';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_parentProjectId_fkey') THEN
    EXECUTE $SQL$
      ALTER TABLE "Project"
      ADD CONSTRAINT "Project_parentProjectId_fkey"
      FOREIGN KEY ("parentProjectId") REFERENCES "Project"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
    $SQL$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'projects_parent_idx') THEN
    EXECUTE 'CREATE INDEX "projects_parent_idx" ON "Project" ("parentProjectId")';
  END IF;
END $$;

-- 1) project_billing_types
DO $$
BEGIN
  IF to_regclass('public."project_billing_types"') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE "project_billing_types" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "code" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "project_billing_types_pkey" PRIMARY KEY ("id")
      )
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "project_billing_types"
      ADD CONSTRAINT "project_billing_types_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_billing_types_tenant_code_uq') THEN
    EXECUTE 'ALTER TABLE "project_billing_types" ADD CONSTRAINT "project_billing_types_tenant_code_uq" UNIQUE ("tenantId", "code")';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'project_billing_types_tenant_active_name_idx') THEN
    EXECUTE 'CREATE INDEX "project_billing_types_tenant_active_name_idx" ON "project_billing_types" ("tenantId", "isActive", "name")';
  END IF;
END $$;

-- 2) contract_types
DO $$
BEGIN
  IF to_regclass('public."contract_types"') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE "contract_types" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "contract_types_pkey" PRIMARY KEY ("id")
      )
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "contract_types"
      ADD CONSTRAINT "contract_types_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_types_tenant_name_uq') THEN
    EXECUTE 'ALTER TABLE "contract_types" ADD CONSTRAINT "contract_types_tenant_name_uq" UNIQUE ("tenantId", "name")';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'contract_types_tenant_active_name_idx') THEN
    EXECUTE 'CREATE INDEX "contract_types_tenant_active_name_idx" ON "contract_types" ("tenantId", "isActive", "name")';
  END IF;
END $$;

-- 3) project_revenues
DO $$
BEGIN
  IF to_regclass('public."project_revenues"') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE "project_revenues" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "billingTypeId" TEXT,
        "title" TEXT,
        "contractedValue" DOUBLE PRECISION,
        "expectedRevenue" DOUBLE PRECISION,
        "realizedRevenue" DOUBLE PRECISION,
        "installmentCount" INTEGER,
        "startDate" TIMESTAMP(3),
        "endDate" TIMESTAMP(3),
        "status" TEXT NOT NULL DEFAULT 'NEGOCIACAO',
        "isAdditive" BOOLEAN NOT NULL DEFAULT FALSE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "project_revenues_pkey" PRIMARY KEY ("id")
      )
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "project_revenues"
      ADD CONSTRAINT "project_revenues_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "project_revenues"
      ADD CONSTRAINT "project_revenues_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_revenues_status_chk') THEN
    EXECUTE $SQL$
      ALTER TABLE "project_revenues"
      ADD CONSTRAINT "project_revenues_status_chk"
      CHECK ("status" IN ('NEGOCIACAO','ATIVO','FINALIZADO','CANCELADO'))
    $SQL$;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_revenues_billingTypeId_fkey') THEN
    EXECUTE $SQL$
      ALTER TABLE "project_revenues"
      ADD CONSTRAINT "project_revenues_billingTypeId_fkey"
      FOREIGN KEY ("billingTypeId") REFERENCES "project_billing_types"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
    $SQL$;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'project_revenues_tenant_project_status_idx') THEN
    EXECUTE 'CREATE INDEX "project_revenues_tenant_project_status_idx" ON "project_revenues" ("tenantId", "projectId", "status")';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'project_revenues_project_created_idx') THEN
    EXECUTE 'CREATE INDEX "project_revenues_project_created_idx" ON "project_revenues" ("projectId", "createdAt")';
  END IF;
END $$;

-- 4) project_revenue_history
DO $$
BEGIN
  IF to_regclass('public."project_revenue_history"') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE "project_revenue_history" (
        "id" TEXT NOT NULL,
        "revenueId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "field" TEXT,
        "oldValue" TEXT,
        "newValue" TEXT,
        "details" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "project_revenue_history_pkey" PRIMARY KEY ("id")
      )
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "project_revenue_history"
      ADD CONSTRAINT "project_revenue_history_revenueId_fkey"
      FOREIGN KEY ("revenueId") REFERENCES "project_revenues"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "project_revenue_history"
      ADD CONSTRAINT "project_revenue_history_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'project_revenue_history_revenue_created_idx') THEN
    EXECUTE 'CREATE INDEX "project_revenue_history_revenue_created_idx" ON "project_revenue_history" ("revenueId", "createdAt")';
  END IF;
END $$;

-- 5) project_contracts
DO $$
BEGIN
  IF to_regclass('public."project_contracts"') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE "project_contracts" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "contractTypeId" TEXT,
        "title" TEXT NOT NULL,
        "vigencyStart" TIMESTAMP(3),
        "vigencyEnd" TIMESTAMP(3),
        "slaDays" INTEGER,
        "readjustmentMonths" INTEGER,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "project_contracts_pkey" PRIMARY KEY ("id")
      )
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "project_contracts"
      ADD CONSTRAINT "project_contracts_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "project_contracts"
      ADD CONSTRAINT "project_contracts_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_contracts_contractTypeId_fkey') THEN
    EXECUTE $SQL$
      ALTER TABLE "project_contracts"
      ADD CONSTRAINT "project_contracts_contractTypeId_fkey"
      FOREIGN KEY ("contractTypeId") REFERENCES "contract_types"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
    $SQL$;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'project_contracts_tenant_project_idx') THEN
    EXECUTE 'CREATE INDEX "project_contracts_tenant_project_idx" ON "project_contracts" ("tenantId", "projectId")';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'project_contracts_project_created_idx') THEN
    EXECUTE 'CREATE INDEX "project_contracts_project_created_idx" ON "project_contracts" ("projectId", "createdAt")';
  END IF;
END $$;

-- 6) project_contract_attachments
DO $$
BEGIN
  IF to_regclass('public."project_contract_attachments"') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE "project_contract_attachments" (
        "id" TEXT NOT NULL,
        "contractId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "filename" TEXT NOT NULL,
        "fileUrl" TEXT NOT NULL,
        "fileType" TEXT NOT NULL,
        "fileSize" INTEGER NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "project_contract_attachments_pkey" PRIMARY KEY ("id")
      )
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "project_contract_attachments"
      ADD CONSTRAINT "project_contract_attachments_contractId_fkey"
      FOREIGN KEY ("contractId") REFERENCES "project_contracts"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "project_contract_attachments"
      ADD CONSTRAINT "project_contract_attachments_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'project_contract_attachments_contract_created_idx') THEN
    EXECUTE 'CREATE INDEX "project_contract_attachments_contract_created_idx" ON "project_contract_attachments" ("contractId", "createdAt")';
  END IF;
END $$;

-- 7) project_contract_history
DO $$
BEGIN
  IF to_regclass('public."project_contract_history"') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE "project_contract_history" (
        "id" TEXT NOT NULL,
        "contractId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "field" TEXT,
        "oldValue" TEXT,
        "newValue" TEXT,
        "details" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "project_contract_history_pkey" PRIMARY KEY ("id")
      )
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "project_contract_history"
      ADD CONSTRAINT "project_contract_history_contractId_fkey"
      FOREIGN KEY ("contractId") REFERENCES "project_contracts"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "project_contract_history"
      ADD CONSTRAINT "project_contract_history_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'project_contract_history_contract_created_idx') THEN
    EXECUTE 'CREATE INDEX "project_contract_history_contract_created_idx" ON "project_contract_history" ("contractId", "createdAt")';
  END IF;
END $$;
