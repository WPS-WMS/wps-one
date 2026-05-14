-- Prisma mapeia `status` como enum nativo em PostgreSQL; a migration inicial usou TEXT + CHECK.
-- Em produção o insert falhava com: type "public.ReimbursementStatus" does not exist (SQLSTATE 42704).
-- Esta migration alinha a coluna ao tipo enum esperado pelo Prisma Client.

-- 1) Criar o tipo enum (idempotente; nome com aspas = o que o Prisma espera em public)
DO $$
BEGIN
  CREATE TYPE "ReimbursementStatus" AS ENUM ('IN_PROGRESS', 'REJECTED', 'PAID');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) Converter coluna TEXT -> enum (apenas se ainda for texto)
DO $$
BEGIN
  IF to_regclass('public."reimbursements"') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reimbursements'
      AND column_name = 'status'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE "reimbursements" DROP CONSTRAINT IF EXISTS "reimbursements_status_chk";

    ALTER TABLE "reimbursements"
      ALTER COLUMN "status" DROP DEFAULT,
      ALTER COLUMN "status" TYPE "ReimbursementStatus" USING ("status"::"ReimbursementStatus"),
      ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS'::"ReimbursementStatus";
  END IF;
END $$;
