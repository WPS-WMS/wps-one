-- Arquivamento de tarefas (soft delete por projeto)
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "arquivado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "arquivadoEm" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "tickets_project_archived_created_idx"
  ON "tickets"("projectId", "arquivado", "createdAt");
