-- Modo global de violação de regras de apontamento + metadados nas solicitações
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "violacaoApontamentoModo" TEXT NOT NULL DEFAULT 'NAO_PERMITIR';

ALTER TABLE "TimeEntryPermissionRequest" ADD COLUMN IF NOT EXISTS "violationRule" TEXT;
ALTER TABLE "TimeEntryPermissionRequest" ADD COLUMN IF NOT EXISTS "submissionBatchId" TEXT;
ALTER TABLE "TimeEntryPermissionRequest" ADD COLUMN IF NOT EXISTS "createdTimeEntryId" TEXT;

CREATE INDEX IF NOT EXISTS "time_entry_permission_req_batch_idx"
  ON "TimeEntryPermissionRequest"("submissionBatchId");
