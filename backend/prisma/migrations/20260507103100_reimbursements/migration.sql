-- Reembolsos: tipos, limites por projeto e solicitações + anexos.
-- Idempotente: seguro para rodar mais de uma vez (ex.: QA com drift).

-- 1) Tabela reimbursement_types
DO $$
BEGIN
  IF to_regclass('public."reimbursement_types"') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE "reimbursement_types" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "reimbursement_types_pkey" PRIMARY KEY ("id")
      )
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "reimbursement_types"
      ADD CONSTRAINT "reimbursement_types_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reimbursement_types_tenant_name_uq'
  ) THEN
    EXECUTE 'ALTER TABLE "reimbursement_types" ADD CONSTRAINT "reimbursement_types_tenant_name_uq" UNIQUE ("tenantId", "name")';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'reimbursement_types_tenant_active_name_idx'
  ) THEN
    EXECUTE 'CREATE INDEX "reimbursement_types_tenant_active_name_idx" ON "reimbursement_types" ("tenantId", "isActive", "name")';
  END IF;
END $$;

-- 2) Enum ReimbursementStatus (como TEXT + CHECK para simplificar compatibilidade/idempotência)
-- Prisma mapeia enum, mas nosso schema usa migrations SQL idempotentes.
-- Garantimos valores válidos via CHECK.

-- 3) Tabela reimbursements
DO $$
BEGIN
  IF to_regclass('public."reimbursements"') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE "reimbursements" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "typeId" TEXT NOT NULL,
        "amountCents" INTEGER NOT NULL,
        "description" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
        "rejectionReason" TEXT,
        "paidAt" TIMESTAMP(3),
        "reviewedAt" TIMESTAMP(3),
        "reviewedById" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "reimbursements_pkey" PRIMARY KEY ("id")
      )
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "reimbursements"
      ADD CONSTRAINT "reimbursements_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "reimbursements"
      ADD CONSTRAINT "reimbursements_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "reimbursements"
      ADD CONSTRAINT "reimbursements_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "reimbursements"
      ADD CONSTRAINT "reimbursements_typeId_fkey"
      FOREIGN KEY ("typeId") REFERENCES "reimbursement_types"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "reimbursements"
      ADD CONSTRAINT "reimbursements_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reimbursements_status_chk'
  ) THEN
    EXECUTE $SQL$
      ALTER TABLE "reimbursements"
      ADD CONSTRAINT "reimbursements_status_chk"
      CHECK ("status" IN ('IN_PROGRESS','REJECTED','PAID'))
    $SQL$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'reimbursements_tenant_status_created_idx'
  ) THEN
    EXECUTE 'CREATE INDEX "reimbursements_tenant_status_created_idx" ON "reimbursements" ("tenantId", "status", "createdAt")';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'reimbursements_tenant_user_created_idx'
  ) THEN
    EXECUTE 'CREATE INDEX "reimbursements_tenant_user_created_idx" ON "reimbursements" ("tenantId", "userId", "createdAt")';
  END IF;
END $$;

-- 4) Tabela reimbursement_attachments
DO $$
BEGIN
  IF to_regclass('public."reimbursement_attachments"') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE "reimbursement_attachments" (
        "id" TEXT NOT NULL,
        "reimbursementId" TEXT NOT NULL,
        "filename" TEXT NOT NULL,
        "fileUrl" TEXT NOT NULL,
        "fileType" TEXT NOT NULL,
        "fileSize" INTEGER NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "reimbursement_attachments_pkey" PRIMARY KEY ("id")
      )
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "reimbursement_attachments"
      ADD CONSTRAINT "reimbursement_attachments_reimbursementId_fkey"
      FOREIGN KEY ("reimbursementId") REFERENCES "reimbursements"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'reimbursement_attachments_reimbursement_created_idx'
  ) THEN
    EXECUTE 'CREATE INDEX "reimbursement_attachments_reimbursement_created_idx" ON "reimbursement_attachments" ("reimbursementId", "createdAt")';
  END IF;
END $$;

-- 5) Tabela reimbursement_project_limits (limite por projeto e tipo)
DO $$
BEGIN
  IF to_regclass('public."reimbursement_project_limits"') IS NULL THEN
    EXECUTE $SQL$
      CREATE TABLE "reimbursement_project_limits" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "typeId" TEXT NOT NULL,
        "maxValueCents" INTEGER NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "reimbursement_project_limits_pkey" PRIMARY KEY ("id")
      )
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "reimbursement_project_limits"
      ADD CONSTRAINT "reimbursement_project_limits_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "reimbursement_project_limits"
      ADD CONSTRAINT "reimbursement_project_limits_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;

    EXECUTE $SQL$
      ALTER TABLE "reimbursement_project_limits"
      ADD CONSTRAINT "reimbursement_project_limits_typeId_fkey"
      FOREIGN KEY ("typeId") REFERENCES "reimbursement_types"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    $SQL$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reimbursement_limits_tenant_project_type_uq'
  ) THEN
    EXECUTE 'ALTER TABLE "reimbursement_project_limits" ADD CONSTRAINT "reimbursement_limits_tenant_project_type_uq" UNIQUE ("tenantId", "projectId", "typeId")';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'reimbursement_limits_tenant_project_idx'
  ) THEN
    EXECUTE 'CREATE INDEX "reimbursement_limits_tenant_project_idx" ON "reimbursement_project_limits" ("tenantId", "projectId")';
  END IF;
END $$;

