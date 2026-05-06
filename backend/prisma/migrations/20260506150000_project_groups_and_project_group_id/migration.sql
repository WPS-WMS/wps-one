-- Project groups + vínculo opcional no Project (Project.projectGroupId).
-- Idempotente: seguro para rodar mais de uma vez (ex.: QA com drift).

-- 1) Tabela project_groups
DO $$
BEGIN
  IF to_regclass('public."project_groups"') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE "project_groups" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "project_groups_pkey" PRIMARY KEY ("id")
      )
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "project_groups"
      ADD CONSTRAINT "project_groups_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

-- Índices/constraints (idempotentes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'project_groups_tenant_name_uq'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX "project_groups_tenant_name_uq" ON "project_groups" ("tenantId", "name")';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'project_groups_tenant_name_idx'
  ) THEN
    EXECUTE 'CREATE INDEX "project_groups_tenant_name_idx" ON "project_groups" ("tenantId", "name")';
  END IF;
END $$;

-- 2) Coluna Project.projectGroupId + FK + índice
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Project'
  ) THEN
    -- Coluna
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Project' AND column_name = 'projectGroupId'
    ) THEN
      EXECUTE 'ALTER TABLE "Project" ADD COLUMN "projectGroupId" TEXT';
    END IF;

    -- FK (SetNull)
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'Project_projectGroupId_fkey'
    ) THEN
      EXECUTE $SQL$
        ALTER TABLE "Project"
        ADD CONSTRAINT "Project_projectGroupId_fkey"
        FOREIGN KEY ("projectGroupId") REFERENCES "project_groups"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
      $SQL$;
    END IF;

    -- Índice (schema.prisma: @@index([clientId, projectGroupId]))
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'Project_clientId_projectGroupId_idx'
    ) THEN
      EXECUTE 'CREATE INDEX "Project_clientId_projectGroupId_idx" ON "Project" ("clientId", "projectGroupId")';
    END IF;
  END IF;
END $$;

