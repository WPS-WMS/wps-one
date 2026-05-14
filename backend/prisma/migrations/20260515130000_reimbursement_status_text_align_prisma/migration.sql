-- O schema Prisma define `Reimbursement.status` como String (TEXT).
-- A migration 20260514170000 converteu a coluna para o enum nativo "ReimbursementStatus",
-- o que provoca P2032 no runtime ("expected String, found IN_PROGRESS") e derruba o processo (502).
-- Voltamos a TEXT + CHECK, alinhado ao client e às rotas.

DO $$
BEGIN
  IF to_regclass('public."reimbursements"') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reimbursements'
      AND column_name = 'status'
      AND udt_name = 'ReimbursementStatus'
  ) THEN
    RETURN;
  END IF;

  ALTER TABLE "reimbursements" DROP CONSTRAINT IF EXISTS "reimbursements_status_chk";

  ALTER TABLE "reimbursements"
    ALTER COLUMN "status" DROP DEFAULT,
    ALTER COLUMN "status" TYPE TEXT USING ("status"::text),
    ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS',
    ALTER COLUMN "status" SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reimbursements_status_chk'
  ) THEN
    ALTER TABLE "reimbursements"
      ADD CONSTRAINT "reimbursements_status_chk"
      CHECK ("status" IN ('IN_PROGRESS','REJECTED','PAID'));
  END IF;
END $$;

-- Tipo enum deixa de ser usado pela coluna; remove para evitar confusão em futuros deploys.
DROP TYPE IF EXISTS "ReimbursementStatus";
