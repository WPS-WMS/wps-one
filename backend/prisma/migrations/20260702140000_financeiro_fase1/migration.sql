-- Financeiro Fase 1: categorias, centros de custo, plano de contas, fornecedores, cliente financeiro.
-- Idempotente: seguro para rodar mais de uma vez (ex.: QA com drift).

-- 1) supplier_categories
DO $$
BEGIN
  IF to_regclass('public."supplier_categories"') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE "supplier_categories" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "supplier_categories_pkey" PRIMARY KEY ("id")
      )
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "supplier_categories"
      ADD CONSTRAINT "supplier_categories_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_categories_tenant_name_uq') THEN
    EXECUTE 'ALTER TABLE "supplier_categories" ADD CONSTRAINT "supplier_categories_tenant_name_uq" UNIQUE ("tenantId", "name")';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'supplier_categories_tenant_active_name_idx') THEN
    EXECUTE 'CREATE INDEX "supplier_categories_tenant_active_name_idx" ON "supplier_categories" ("tenantId", "isActive", "name")';
  END IF;
END $$;

-- 2) cost_centers
DO $$
BEGIN
  IF to_regclass('public."cost_centers"') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE "cost_centers" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "code" TEXT,
        "name" TEXT NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
      )
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "cost_centers"
      ADD CONSTRAINT "cost_centers_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cost_centers_tenant_name_uq') THEN
    EXECUTE 'ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_tenant_name_uq" UNIQUE ("tenantId", "name")';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'cost_centers_tenant_active_name_idx') THEN
    EXECUTE 'CREATE INDEX "cost_centers_tenant_active_name_idx" ON "cost_centers" ("tenantId", "isActive", "name")';
  END IF;
END $$;

-- 3) financial_accounts
DO $$
BEGIN
  IF to_regclass('public."financial_accounts"') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE "financial_accounts" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "code" TEXT,
        "name" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "parentId" TEXT,
        "costCenterId" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
      )
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "financial_accounts"
      ADD CONSTRAINT "financial_accounts_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_accounts_type_chk') THEN
    EXECUTE $SQL$
      ALTER TABLE "financial_accounts"
      ADD CONSTRAINT "financial_accounts_type_chk"
      CHECK ("type" IN ('RECEITA','DESPESA'))
    $SQL$;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_accounts_parentId_fkey') THEN
    EXECUTE $SQL$
      ALTER TABLE "financial_accounts"
      ADD CONSTRAINT "financial_accounts_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "financial_accounts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
    $SQL$;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_accounts_costCenterId_fkey') THEN
    EXECUTE $SQL$
      ALTER TABLE "financial_accounts"
      ADD CONSTRAINT "financial_accounts_costCenterId_fkey"
      FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
    $SQL$;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_accounts_tenant_name_type_uq') THEN
    EXECUTE 'ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_tenant_name_type_uq" UNIQUE ("tenantId", "name", "type")';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'financial_accounts_tenant_type_active_idx') THEN
    EXECUTE 'CREATE INDEX "financial_accounts_tenant_type_active_idx" ON "financial_accounts" ("tenantId", "type", "isActive")';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'financial_accounts_tenant_parent_idx') THEN
    EXECUTE 'CREATE INDEX "financial_accounts_tenant_parent_idx" ON "financial_accounts" ("tenantId", "parentId")';
  END IF;
END $$;

-- 4) suppliers
DO $$
BEGIN
  IF to_regclass('public."suppliers"') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE "suppliers" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "personType" TEXT NOT NULL,
        "nomeApelido" TEXT NOT NULL,
        "razaoSocial" TEXT,
        "cnpjCpf" TEXT NOT NULL,
        "ie" TEXT,
        "ieIsento" BOOLEAN NOT NULL DEFAULT FALSE,
        "cep" TEXT,
        "endereco" TEXT,
        "numero" TEXT,
        "complemento" TEXT,
        "bairro" TEXT,
        "cidade" TEXT,
        "estado" TEXT,
        "email" TEXT,
        "telefone" TEXT,
        "banco" TEXT,
        "agencia" TEXT,
        "conta" TEXT,
        "pixKey" TEXT,
        "contatoFinNome" TEXT,
        "contatoFinEmail" TEXT,
        "contatoFinCel" TEXT,
        "contatoTecNome" TEXT,
        "contatoTecEmail" TEXT,
        "contatoTecCel" TEXT,
        "categoryId" TEXT,
        "status" TEXT NOT NULL DEFAULT 'ATIVO',
        "observacoes" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
      )
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "suppliers"
      ADD CONSTRAINT "suppliers_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_person_type_chk') THEN
    EXECUTE $SQL$
      ALTER TABLE "suppliers"
      ADD CONSTRAINT "suppliers_person_type_chk"
      CHECK ("personType" IN ('PJ','PF'))
    $SQL$;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_status_chk') THEN
    EXECUTE $SQL$
      ALTER TABLE "suppliers"
      ADD CONSTRAINT "suppliers_status_chk"
      CHECK ("status" IN ('ATIVO','INATIVO'))
    $SQL$;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_categoryId_fkey') THEN
    EXECUTE $SQL$
      ALTER TABLE "suppliers"
      ADD CONSTRAINT "suppliers_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "supplier_categories"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
    $SQL$;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_tenant_cnpj_cpf_uq') THEN
    EXECUTE 'ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_cnpj_cpf_uq" UNIQUE ("tenantId", "cnpjCpf")';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'suppliers_tenant_status_name_idx') THEN
    EXECUTE 'CREATE INDEX "suppliers_tenant_status_name_idx" ON "suppliers" ("tenantId", "status", "nomeApelido")';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'suppliers_tenant_category_idx') THEN
    EXECUTE 'CREATE INDEX "suppliers_tenant_category_idx" ON "suppliers" ("tenantId", "categoryId")';
  END IF;
END $$;

-- 5) supplier_attachments
DO $$
BEGIN
  IF to_regclass('public."supplier_attachments"') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE "supplier_attachments" (
        "id" TEXT NOT NULL,
        "supplierId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "filename" TEXT NOT NULL,
        "fileUrl" TEXT NOT NULL,
        "fileType" TEXT NOT NULL,
        "fileSize" INTEGER NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "supplier_attachments_pkey" PRIMARY KEY ("id")
      )
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "supplier_attachments"
      ADD CONSTRAINT "supplier_attachments_supplierId_fkey"
      FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "supplier_attachments"
      ADD CONSTRAINT "supplier_attachments_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'supplier_attachments_supplier_created_idx') THEN
    EXECUTE 'CREATE INDEX "supplier_attachments_supplier_created_idx" ON "supplier_attachments" ("supplierId", "createdAt")';
  END IF;
END $$;

-- 6) supplier_history
DO $$
BEGIN
  IF to_regclass('public."supplier_history"') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE "supplier_history" (
        "id" TEXT NOT NULL,
        "supplierId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "field" TEXT,
        "oldValue" TEXT,
        "newValue" TEXT,
        "details" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "supplier_history_pkey" PRIMARY KEY ("id")
      )
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "supplier_history"
      ADD CONSTRAINT "supplier_history_supplierId_fkey"
      FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "supplier_history"
      ADD CONSTRAINT "supplier_history_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'supplier_history_supplier_created_idx') THEN
    EXECUTE 'CREATE INDEX "supplier_history_supplier_created_idx" ON "supplier_history" ("supplierId", "createdAt")';
  END IF;
END $$;

-- 7) client_financials
DO $$
BEGIN
  IF to_regclass('public."client_financials"') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE "client_financials" (
        "id" TEXT NOT NULL,
        "clientId" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "razaoSocial" TEXT,
        "ie" TEXT,
        "ieIsento" BOOLEAN NOT NULL DEFAULT FALSE,
        "condicoesPagamento" TEXT,
        "prazoMedioPagamentoDias" INTEGER,
        "moedaContrato" TEXT NOT NULL DEFAULT 'BRL',
        "retencaoImpostos" TEXT,
        "dadosFaturamento" TEXT,
        "contatoFinNome" TEXT,
        "contatoFinEmail" TEXT,
        "contatoFinCel" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "client_financials_pkey" PRIMARY KEY ("id")
      )
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "client_financials"
      ADD CONSTRAINT "client_financials_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "client_financials"
      ADD CONSTRAINT "client_financials_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_financials_clientId_key') THEN
    EXECUTE 'ALTER TABLE "client_financials" ADD CONSTRAINT "client_financials_clientId_key" UNIQUE ("clientId")';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'client_financials_tenant_idx') THEN
    EXECUTE 'CREATE INDEX "client_financials_tenant_idx" ON "client_financials" ("tenantId")';
  END IF;
END $$;
