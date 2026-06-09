-- Modo global de violação de regras de apontamento + metadados nas solicitações
-- User @@map("users") — tabela física é "users", não "User"

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'violacaoApontamentoModo'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "violacaoApontamentoModo" TEXT NOT NULL DEFAULT 'NAO_PERMITIR';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'TimeEntryPermissionRequest' AND column_name = 'violationRule'
  ) THEN
    ALTER TABLE "TimeEntryPermissionRequest" ADD COLUMN "violationRule" TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'TimeEntryPermissionRequest' AND column_name = 'submissionBatchId'
  ) THEN
    ALTER TABLE "TimeEntryPermissionRequest" ADD COLUMN "submissionBatchId" TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'TimeEntryPermissionRequest' AND column_name = 'createdTimeEntryId'
  ) THEN
    ALTER TABLE "TimeEntryPermissionRequest" ADD COLUMN "createdTimeEntryId" TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "TimeEntryPermissionRequest_submissionBatchId_idx"
  ON "TimeEntryPermissionRequest"("submissionBatchId");
