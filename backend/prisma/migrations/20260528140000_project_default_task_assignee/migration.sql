-- Consultor padrão para novas tarefas abertas pelo cliente (membro do projeto).
DO $$
BEGIN
  IF to_regclass('public."Project"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Project'
        AND column_name = 'defaultTaskAssigneeId'
    ) THEN
      EXECUTE 'ALTER TABLE "Project" ADD COLUMN "defaultTaskAssigneeId" TEXT';
      EXECUTE 'CREATE INDEX "Project_defaultTaskAssigneeId_idx" ON "Project"("defaultTaskAssigneeId")';
      EXECUTE '
        ALTER TABLE "Project"
        ADD CONSTRAINT "Project_defaultTaskAssigneeId_fkey"
        FOREIGN KEY ("defaultTaskAssigneeId") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
      ';
    END IF;
  END IF;
END $$;
