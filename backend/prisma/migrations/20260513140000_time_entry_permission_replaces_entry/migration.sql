-- Edição de apontamento acima do limite: vincula solicitação ao TimeEntry a atualizar na aprovação
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'TimeEntryPermissionRequest' AND column_name = 'replacesTimeEntryId'
  ) THEN
    ALTER TABLE "TimeEntryPermissionRequest" ADD COLUMN "replacesTimeEntryId" TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "TimeEntryPermissionRequest_replacesTimeEntryId_idx"
  ON "TimeEntryPermissionRequest"("replacesTimeEntryId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TimeEntryPermissionRequest_replacesTimeEntryId_fkey'
  ) THEN
    ALTER TABLE "TimeEntryPermissionRequest"
      ADD CONSTRAINT "TimeEntryPermissionRequest_replacesTimeEntryId_fkey"
      FOREIGN KEY ("replacesTimeEntryId") REFERENCES "TimeEntry"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
