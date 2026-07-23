-- Profissional na regra de recorrência (tipo de contrato via employmentType)

ALTER TABLE "payable_recurrence_rules"
ADD COLUMN IF NOT EXISTS "professionalUserId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payable_recurrence_rules_professionalUserId_fkey'
  ) THEN
    ALTER TABLE "payable_recurrence_rules"
      ADD CONSTRAINT "payable_recurrence_rules_professionalUserId_fkey"
      FOREIGN KEY ("professionalUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "payable_recurrence_rules_professional_idx"
ON "payable_recurrence_rules"("professionalUserId");
