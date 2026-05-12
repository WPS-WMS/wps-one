-- Limites por projeto: permitir NULL em ambos os campos (ex.: "sem limite" / sem teto).
-- Cenário QA/prod: após renomear maxValueCents -> maxUnitValueCents, a coluna manteve NOT NULL;
-- o app grava maxValueCents/maxUnitValueCents nulos para ilimitado e o Postgres rejeitava.

DO $$
BEGIN
  IF to_regclass('public."reimbursement_project_limits"') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'reimbursement_project_limits'
        AND column_name = 'maxUnitValueCents'
        AND is_nullable = 'NO'
    ) THEN
      EXECUTE 'ALTER TABLE "reimbursement_project_limits" ALTER COLUMN "maxUnitValueCents" DROP NOT NULL';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'reimbursement_project_limits'
        AND column_name = 'maxValueCents'
        AND is_nullable = 'NO'
    ) THEN
      EXECUTE 'ALTER TABLE "reimbursement_project_limits" ALTER COLUMN "maxValueCents" DROP NOT NULL';
    END IF;
  END IF;
END $$;
