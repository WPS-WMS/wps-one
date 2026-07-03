-- Financeiro Fase 3: lançamentos financeiros com centro de custo obrigatório.
-- Idempotente.

DO $$
BEGIN
  IF to_regclass('public."financial_entries"') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE "financial_entries" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "costCenterId" TEXT NOT NULL,
        "financialAccountId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "amountCents" INTEGER NOT NULL,
        "entryDate" DATE NOT NULL,
        "description" TEXT,
        "status" TEXT NOT NULL DEFAULT 'LANCADO',
        "supplierId" TEXT,
        "projectId" TEXT,
        "createdById" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "financial_entries_pkey" PRIMARY KEY ("id")
      )
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "financial_entries"
      ADD CONSTRAINT "financial_entries_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "financial_entries"
      ADD CONSTRAINT "financial_entries_costCenterId_fkey"
      FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "financial_entries"
      ADD CONSTRAINT "financial_entries_financialAccountId_fkey"
      FOREIGN KEY ("financialAccountId") REFERENCES "financial_accounts"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "financial_entries"
      ADD CONSTRAINT "financial_entries_supplierId_fkey"
      FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "financial_entries"
      ADD CONSTRAINT "financial_entries_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "financial_entries"
      ADD CONSTRAINT "financial_entries_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'financial_entries_tenant_cc_date_idx') THEN
    EXECUTE 'CREATE INDEX "financial_entries_tenant_cc_date_idx" ON "financial_entries" ("tenantId", "costCenterId", "entryDate")';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'financial_entries_tenant_account_date_idx') THEN
    EXECUTE 'CREATE INDEX "financial_entries_tenant_account_date_idx" ON "financial_entries" ("tenantId", "financialAccountId", "entryDate")';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'financial_entries_tenant_project_idx') THEN
    EXECUTE 'CREATE INDEX "financial_entries_tenant_project_idx" ON "financial_entries" ("tenantId", "projectId")';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'financial_entries_tenant_date_status_idx') THEN
    EXECUTE 'CREATE INDEX "financial_entries_tenant_date_status_idx" ON "financial_entries" ("tenantId", "entryDate", "status")';
  END IF;
END $$;
