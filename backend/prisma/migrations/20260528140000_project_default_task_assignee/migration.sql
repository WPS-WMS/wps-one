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
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Project_defaultTaskAssigneeId_idx"
  ON "Project"("defaultTaskAssigneeId");

DO $$
BEGIN
  IF to_regclass('public."Project"') IS NOT NULL
     AND to_regclass('public."users"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'Project_defaultTaskAssigneeId_fkey'
     ) THEN
    EXECUTE '
      ALTER TABLE "Project"
      ADD CONSTRAINT "Project_defaultTaskAssigneeId_fkey"
      FOREIGN KEY ("defaultTaskAssigneeId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
    ';
  END IF;
END $$;
