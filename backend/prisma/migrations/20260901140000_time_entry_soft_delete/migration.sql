-- Soft delete em apontamentos: registros excluídos permanecem no banco para auditoria/recuperação.

ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;

CREATE INDEX IF NOT EXISTS "TimeEntry_deletedAt_idx" ON "TimeEntry"("deletedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TimeEntry_deletedById_fkey'
  ) THEN
    ALTER TABLE "TimeEntry"
      ADD CONSTRAINT "TimeEntry_deletedById_fkey"
      FOREIGN KEY ("deletedById") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
